import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getWeeklyVolumeTrends,
  getMuscleGroupExposure,
  getConsistencyMetrics,
  getPersonalRecords,
  getExerciseHistory,
} from '@/lib/analytics';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric');
    const range = searchParams.get('range') ?? '3m';
    const exerciseId = searchParams.get('exerciseId');

    const weeks = rangeToWeeks(range);

    switch (metric) {
      case 'volume': {
        const trends = await getWeeklyVolumeTrends(weeks);
        return NextResponse.json({ trends });
      }

      case 'muscles': {
        const { getDateRangeMuscleExposure } = await import('@/lib/analytics/muscle-exposure');
        const customStart = searchParams.get('startDate');
        const customEnd = searchParams.get('endDate');

        let start: Date;
        let end: Date = new Date();

        if (customStart && customEnd) {
          start = new Date(customStart);
          end = new Date(customEnd);
          end.setHours(23, 59, 59, 999);
        } else if (range === 'this-week') {
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          start = new Date(now.setDate(diff));
          start.setHours(0, 0, 0, 0);
          end = new Date();
        } else if (range === 'last-week') {
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
          start = new Date(now.setDate(diff));
          start.setHours(0, 0, 0, 0);
          const endD = new Date(start);
          endD.setDate(endD.getDate() + 6);
          endD.setHours(23, 59, 59, 999);
          end = endD;
        } else if (range === '8w') {
          start = new Date();
          start.setDate(start.getDate() - 56);
          start.setHours(0, 0, 0, 0);
        } else if (range === '4w' || range === '1m') {
          start = new Date();
          start.setDate(start.getDate() - 28);
          start.setHours(0, 0, 0, 0);
        } else {
          const days = weeks * 7;
          start = new Date();
          start.setDate(start.getDate() - days);
          start.setHours(0, 0, 0, 0);
        }

        const muscleMapState = await getDateRangeMuscleExposure(start, end);
        const totalWorkoutsInDb = await prisma.workout.count();
        return NextResponse.json({
          muscleMapState,
          period: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            range,
          },
          totalWorkoutsInDb,
        });
      }

      case 'consistency': {
        const metrics = await getConsistencyMetrics();
        return NextResponse.json({ metrics });
      }

      case 'records': {
        const records = await getPersonalRecords(exerciseId ?? undefined);
        return NextResponse.json({ records });
      }

      case 'exercise': {
        if (!exerciseId) {
          return NextResponse.json({ error: 'exerciseId required' }, { status: 400 });
        }
        const history = await getExerciseHistory(exerciseId);
        return NextResponse.json({ history });
      }

      case 'strength': {
        // Get per-exercise 1RM trends
        const exercises = await prisma.exercise.findMany({
          where: {
            workoutExercises: { some: {} },
          },
          select: { id: true, canonicalName: true },
        });

        const strengthData = [];
        for (const ex of exercises.slice(0, 10)) { // Limit to top 10
          const history = await getExerciseHistory(ex.id, weeks);
          if (history && history.entries.length > 0) {
            strengthData.push({
              exerciseId: ex.id,
              exerciseName: ex.canonicalName,
              entries: history.entries.map(e => ({
                date: e.date,
                estimated1RM: e.estimated1RM,
                bestWeight: e.bestSet?.weightKg ?? null,
                bestReps: e.bestSet?.reps ?? null,
              })),
            });
          }
        }

        return NextResponse.json({ strengthData });
      }

      case 'frequency': {
        // Weekly session counts
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - weeks * 7);

        const workouts = await prisma.workout.findMany({
          where: { performedAt: { gte: cutoff } },
          select: { performedAt: true },
          orderBy: { performedAt: 'asc' },
        });

        const weeklyFrequency = new Map<string, number>();
        for (const w of workouts) {
          const weekKey = getWeekKey(w.performedAt);
          weeklyFrequency.set(weekKey, (weeklyFrequency.get(weekKey) ?? 0) + 1);
        }

        const frequency = Array.from(weeklyFrequency.entries()).map(([week, count]) => ({
          week,
          sessions: count,
        }));

        return NextResponse.json({ frequency });
      }

      default:
        return NextResponse.json({ error: 'Unknown metric type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Progress API error:', error);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

function rangeToWeeks(range: string): number {
  switch (range) {
    case '1w': return 1;
    case '1m': return 4;
    case '3m': return 13;
    case '6m': return 26;
    case '1y': return 52;
    case 'all': return 520;
    default: return 13;
  }
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, muscleMapState, periodLabel } = body;

    if (action === 'coach-read') {
      if (!muscleMapState) {
        return NextResponse.json({ error: 'Missing muscleMapState' }, { status: 400 });
      }

      const { generateWeeklyMuscleCoachRead } = await import('@/ai/muscle-coach-read');
      const coachRead = await generateWeeklyMuscleCoachRead({
        muscleMapState,
        periodLabel: periodLabel || 'selected period',
      });

      return NextResponse.json({ coachRead });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Progress POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
