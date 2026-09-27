import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const where = search
      ? { canonicalName: { contains: search, mode: 'insensitive' as const } }
      : {};

    const exercises = await prisma.exercise.findMany({
      where,
      include: {
        aliases: true,
        muscleMaps: true,
        _count: {
          select: { workoutExercises: true },
        },
      },
      orderBy: { canonicalName: 'asc' },
    });

    return NextResponse.json({ exercises });
  } catch (error) {
    console.error('Exercises API error:', error);
    return NextResponse.json({ error: 'Failed to fetch exercises' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { exerciseId, mappings } = body;

    if (!exerciseId || !Array.isArray(mappings)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }

    const primaryMapping = mappings.find((m: { role: string }) => m.role === 'PRIMARY');
    const secondaryMappings = mappings.filter((m: { role: string }) => m.role === 'SECONDARY');

    await prisma.$transaction(
      async (tx) => {
        // Delete existing muscle maps
        await tx.exerciseMuscleMap.deleteMany({
          where: { exerciseId },
        });

        // Insert new maps
        for (const m of mappings) {
          await tx.exerciseMuscleMap.create({
            data: {
              exerciseId,
              muscleGroup: m.muscleGroup,
              role: m.role,
              confidence: m.confidence ?? 'VERIFIED',
              source: 'user',
            },
          });
        }

        // Update legacy exercise fields
        await tx.exercise.update({
          where: { id: exerciseId },
          data: {
            primaryMuscle: primaryMapping ? primaryMapping.muscleGroup : null,
            secondaryMuscles: secondaryMappings.map((s: { muscleGroup: string }) => s.muscleGroup),
            muscleConfidence: 'VERIFIED',
          },
        });
      },
      { timeout: 15000 }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update exercise mapping error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update mapping' },
      { status: 500 }
    );
  }
}
