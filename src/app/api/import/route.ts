import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseHevyText, normalizeExerciseName, guessMusclePrimary } from '@/lib/parser';
import { ImportRequestSchema, SaveWorkoutRequestSchema } from '@/lib/schemas';
import { hashText } from '@/lib/utils';
import { generateWithGemini, isGeminiConfigured } from '@/ai/gemini-client';
import { HEVY_FALLBACK_PARSE_PROMPT } from '@/ai/prompts';
import { ParsedWorkoutSchema } from '@/lib/schemas';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'parse') {
      return handleParse(body);
    } else if (action === 'save') {
      return handleSave(body);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Import API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

async function handleParse(body: Record<string, unknown>) {
  const parsed = ImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { rawText } = parsed.data;
  const textHash = hashText(rawText);

  // Check for duplicate import
  const existing = await prisma.rawHevyImport.findFirst({
    where: { textHash },
    include: { workouts: { select: { id: true } } },
  });

  if (existing && existing.workouts.length > 0) {
    return NextResponse.json({
      isDuplicate: true,
      existingImportId: existing.id,
      existingWorkoutIds: existing.workouts.map(w => w.id),
      message: 'This workout text appears to have been imported before.',
    });
  }

  // Try deterministic parsing first
  const result = parseHevyText(rawText);

  // If parsing produced no exercises, try Gemini fallback
  if (result.workout.exercises.length === 0 && isGeminiConfigured()) {
    try {
      const geminiResult = await generateWithGemini({
        prompt: `${HEVY_FALLBACK_PARSE_PROMPT}\n\nWorkout text:\n${rawText}`,
        temperature: 0.1,
        responseMimeType: 'application/json',
      });
      
      const geminiParsed = ParsedWorkoutSchema.safeParse(JSON.parse(geminiResult));
      if (geminiParsed.success && geminiParsed.data.exercises.length > 0) {
        result.workout = geminiParsed.data;
        result.warnings.push('Parsed using AI fallback — please verify the results');
      }
    } catch {
      result.warnings.push('AI fallback parsing also failed');
    }
  }

  // Store the raw import
  const rawImport = existing ?? await prisma.rawHevyImport.create({
    data: {
      rawText,
      textHash,
      parseStatus: result.workout.exercises.length > 0 ? 'SUCCESS' : 'FAILED',
      parsedAt: new Date(),
      parseErrors: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
    },
  });

  return NextResponse.json({
    isDuplicate: false,
    rawImportId: rawImport.id,
    workout: result.workout,
    warnings: result.warnings,
    unresolvedLines: result.unresolvedLines,
  });
}

async function handleSave(body: Record<string, unknown>) {
  const parsed = SaveWorkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { rawImportId, rawText, workout: workoutData } = parsed.data;

  let finalRawImportId: string | null = rawImportId ?? null;

  if (!finalRawImportId && rawText) {
    const textHash = hashText(rawText);
    const existing = await prisma.rawHevyImport.findFirst({
      where: { textHash },
    });
    if (existing) {
      finalRawImportId = existing.id;
    } else {
      const created = await prisma.rawHevyImport.create({
        data: {
          rawText,
          textHash,
          parseStatus: 'SUCCESS',
          parsedAt: new Date(),
        },
      });
      finalRawImportId = created.id;
    }
  } else if (finalRawImportId) {
    const rawImport = await prisma.rawHevyImport.findUnique({
      where: { id: finalRawImportId },
    });
    if (!rawImport) {
      return NextResponse.json({ error: 'Raw import not found' }, { status: 404 });
    }
  }

  // 1. Resolve exercises outside the transaction
  const exerciseMap = new Map<string, string>(); // rawName -> exerciseId

  const exerciseMeta = workoutData.exercises.map(ex => ({
    rawName: ex.rawName,
    canonicalName: ex.canonicalName ?? normalizeExerciseName(ex.rawName),
    normalizedRaw: normalizeExerciseName(ex.rawName),
  }));

  const uniqueCanonicals = Array.from(new Set(exerciseMeta.map(m => m.canonicalName)));
  const existingExercises = await prisma.exercise.findMany({
    where: { canonicalName: { in: uniqueCanonicals } },
    include: { aliases: true },
  });

  const existingMap = new Map(existingExercises.map(e => [e.canonicalName, e]));

  for (const meta of exerciseMeta) {
    let exercise = existingMap.get(meta.canonicalName);

    if (!exercise) {
      const muscles = guessMusclePrimary(meta.canonicalName);
      const muscleMapsToCreate = [];

      if (muscles.primary) {
        muscleMapsToCreate.push({
          muscleGroup: muscles.primary,
          role: 'PRIMARY' as const,
          confidence: 'ESTIMATED' as const,
        });
        for (const sec of muscles.secondary) {
          muscleMapsToCreate.push({
            muscleGroup: sec,
            role: 'SECONDARY' as const,
            confidence: 'ESTIMATED' as const,
          });
        }
      }

      const aliasesToCreate = [];
      if (meta.normalizedRaw !== meta.canonicalName) {
        aliasesToCreate.push({
          alias: meta.normalizedRaw,
          source: 'import',
        });
      }

      exercise = await prisma.exercise.create({
        data: {
          canonicalName: meta.canonicalName,
          primaryMuscle: muscles.primary,
          secondaryMuscles: muscles.secondary,
          muscleConfidence: muscles.primary ? 'ESTIMATED' : 'UNKNOWN',
          muscleMaps: muscleMapsToCreate.length > 0 ? { create: muscleMapsToCreate } : undefined,
          aliases: aliasesToCreate.length > 0 ? { create: aliasesToCreate } : undefined,
        },
        include: { aliases: true },
      });

      existingMap.set(meta.canonicalName, exercise);
    } else if (meta.normalizedRaw !== meta.canonicalName) {
      const hasAlias = exercise.aliases.some(a => a.alias === meta.normalizedRaw);
      if (!hasAlias) {
        try {
          await prisma.exerciseAlias.create({
            data: {
              exerciseId: exercise.id,
              alias: meta.normalizedRaw,
              source: 'import',
            },
          });
        } catch {
          // Ignore concurrent alias creation
        }
      }
    }

    exerciseMap.set(meta.rawName, exercise.id);
  }

  // 2. Create workout in an atomic transaction with 30s timeout
  const performedAt = workoutData.performedAt
    ? new Date(workoutData.performedAt)
    : new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      const workout = await tx.workout.create({
        data: {
          rawImportId: finalRawImportId,
          name: workoutData.name,
          performedAt,
          durationMinutes: workoutData.durationMinutes,
          notes: workoutData.notes,
          exercises: {
            create: workoutData.exercises.map((ex, idx) => ({
              exerciseId: exerciseMap.get(ex.rawName)!,
              orderIndex: idx,
              rawName: ex.rawName,
              notes: ex.notes,
              sets: {
                create: ex.sets.map((set) => ({
                  setIndex: set.setIndex,
                  setType: set.setType,
                  weightKg: set.weightKg,
                  reps: set.reps,
                  durationSeconds: set.durationSeconds,
                  distanceMeters: set.distanceMeters,
                  rpe: set.rpe,
                  isPersonalRecord: set.isPersonalRecord,
                  notes: set.notes,
                })),
              },
            })),
          },
        },
        include: {
          exercises: {
            include: {
              sets: true,
              exercise: true,
            },
          },
        },
      });

      // Update raw import status if present
      if (finalRawImportId) {
        await tx.rawHevyImport.update({
          where: { id: finalRawImportId },
          data: { parseStatus: 'SUCCESS' },
        });
      }

      return workout;
    },
    {
      timeout: 30000,
      maxWait: 10000,
    }
  );

  return NextResponse.json({ workout: result });
}

export async function GET() {
  try {
    const imports = await prisma.rawHevyImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        workouts: {
          select: { id: true, name: true, performedAt: true },
        },
      },
    });

    return NextResponse.json({ imports });
  } catch (error) {
    console.error('Failed to fetch imports:', error);
    return NextResponse.json({ error: 'Failed to fetch imports' }, { status: 500 });
  }
}
