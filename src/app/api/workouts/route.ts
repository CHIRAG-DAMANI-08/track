import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  calculateWorkoutStats,
  compareWithPrevious,
} from '@/lib/analytics';
import { analyzeWorkout } from '@/ai/workout-analysis';
import { processMemoryCandidates } from '@/ai/memory-extraction';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const workout = await prisma.workout.findUnique({
        where: { id },
        include: {
          exercises: {
            include: {
              sets: { orderBy: { setIndex: 'asc' } },
              exercise: {
                include: {
                  muscleMaps: true,
                },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!workout) {
        return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
      }

      const { getWorkoutMuscleExposure } = await import('@/lib/analytics/muscle-exposure');
      const muscleExposure = await getWorkoutMuscleExposure(id);
      const stats = await calculateWorkoutStats(id);
      const comparison = await compareWithPrevious(id);

      return NextResponse.json({ workout, muscleExposure, stats, comparison });
    }

    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const workouts = await prisma.workout.findMany({
      orderBy: { performedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: { select: { id: true, canonicalName: true, primaryMuscle: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    const total = await prisma.workout.count();

    return NextResponse.json({ workouts, total });
  } catch (error) {
    console.error('Failed to fetch workouts:', error);
    return NextResponse.json({ error: 'Failed to fetch workouts' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing workout ID' }, { status: 400 });
    }

    await prisma.workout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workout:', error);
    return NextResponse.json({ error: 'Failed to delete workout' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, workoutId } = body;

    if (action === 'analyze') {
      if (!workoutId) {
        return NextResponse.json({ error: 'Missing workoutId' }, { status: 400 });
      }

      const analysis = await analyzeWorkout(workoutId);

      // Store observations
      for (const obs of analysis.observations) {
        await prisma.coachObservation.create({
          data: {
            workoutId,
            type: obs.type,
            content: obs.content,
            confidence: obs.confidence,
            evidenceSummary: obs.evidenceSummary,
          },
        });
      }

      // Store hypotheses
      for (const hyp of analysis.hypotheses) {
        await prisma.coachHypothesis.create({
          data: {
            statement: hyp.statement,
            reasoning: hyp.reasoning,
            confidence: hyp.confidence,
            evidenceFor: hyp.evidenceFor,
          },
        });
      }

      // Store recommendations
      for (const rec of analysis.recommendations) {
        await prisma.coachRecommendation.create({
          data: {
            title: rec.title,
            content: rec.content,
            reasoning: rec.reasoning,
            priority: rec.priority,
            category: rec.category,
          },
        });
      }

      // Process candidate memories
      if (analysis.candidateMemories.length > 0) {
        await processMemoryCandidates(
          analysis.candidateMemories,
          'workout_analysis',
          workoutId
        );
      }

      return NextResponse.json({ analysis });
    }

    if (action === 'stats') {
      if (!workoutId) {
        return NextResponse.json({ error: 'Missing workoutId' }, { status: 400 });
      }

      const stats = await calculateWorkoutStats(workoutId);
      const comparison = await compareWithPrevious(workoutId);

      return NextResponse.json({ stats, comparison });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Workout API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
