import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPersonalizedAthleteProfile } from '@/lib/personalization/context';
import { getTimeAwareGreeting } from '@/lib/personalization/greeting';
import { getDateRangeMuscleExposure } from '@/lib/analytics/muscle-exposure';
import { getLocalWeekStart, getLocalWeekEnd, toLocalDateKey, formatInAthleteTimeZone } from '@/lib/dates/training-calendar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface DashboardResponse {
  athlete: {
    name: string;
    greeting: string;
    subtext: string;
  };
  training: {
    workoutsThisWeek: number;
    weekDays: Array<{
      day: string;
      date: string;
      active: boolean;
      isToday: boolean;
    }>;
    totalSetsThisWeek: number;
    volumeThisWeek: number;
  };
  records: {
    type: 'prs' | 'sets' | 'workouts';
    value: number | string;
    label: string;
    sublabel: string;
  };
  muscleCoverage: {
    hasData: boolean;
    bodyState: Record<string, { intensity: number; selected: boolean }>;
    topMuscles: Array<{
      displayName: string;
      sets: number;
      percentage: number;
    }>;
  };
  strengthMovers: Array<{
    exerciseName: string;
    trend: 'up' | 'down' | 'stable';
    changeText: string;
  }>;
  coachSnapshot: {
    hasInsight: boolean;
    insight: string;
    ctaText: string;
    ctaHref: string;
  };
  latestWorkout: {
    id: string;
    name: string;
    performedAt: string;
    formattedDate: string;
    setsCount: number;
    exercisesCount: number;
  } | null;
}

export async function GET() {
  const startTime = Date.now();
  try {
    const now = new Date();

    // 1. Current Week calculation — centralized Monday-start convention
    const weekStart = getLocalWeekStart(now);
    const weekEnd = getLocalWeekEnd(now);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all top-level queries in parallel to eliminate waterfalls
    const [
      profile,
      weekWorkouts,
      totalWorkoutsCount,
      prCount,
      initialMuscleExposure,
      observation,
      latest,
      distinctExercises,
    ] = await Promise.all([
      getPersonalizedAthleteProfile(),
      prisma.workout.findMany({
        where: {
          performedAt: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        select: {
          id: true,
          performedAt: true,
          exercises: {
            select: {
              sets: {
                select: {
                  setType: true,
                  weightKg: true,
                  reps: true,
                },
              },
            },
          },
        },
        orderBy: { performedAt: 'desc' },
      }),
      prisma.workout.count(),
      prisma.exerciseSet.count({
        where: {
          isPersonalRecord: true,
          workoutExercise: {
            workout: {
              performedAt: { gte: monthStart },
            },
          },
        },
      }),
      getDateRangeMuscleExposure(weekStart, weekEnd),
      prisma.coachObservation.findFirst({
        where: {
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          content: true,
          type: true,
        },
      }),
      prisma.workout.findFirst({
        orderBy: { performedAt: 'desc' },
        select: {
          id: true,
          name: true,
          performedAt: true,
          exercises: {
            select: {
              id: true,
              sets: {
                select: { setType: true },
              },
            },
          },
        },
      }),
      prisma.exercise.findMany({
        where: {
          workoutExercises: { some: {} },
        },
        select: { id: true, canonicalName: true },
        take: 5,
      }),
    ]);

    const userName = profile.displayName || profile.firstName || 'Chirag';
    const greeting = getTimeAwareGreeting(userName);

    // Calculate week days status using athlete local date keys
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayKey = toLocalDateKey(now);

    const weekDays = dayLabels.map((dayLabel, index) => {
      const d = new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000);
      const dayKey = toLocalDateKey(d);

      const active = weekWorkouts.some(
        (w) => toLocalDateKey(w.performedAt) === dayKey
      );

      return {
        day: dayLabel,
        date: d.toISOString(),
        active,
        isToday: dayKey === todayKey,
      };
    });

    let totalSetsThisWeek = 0;
    let volumeThisWeek = 0;
    for (const w of weekWorkouts) {
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (s.setType !== 'WARMUP') {
            totalSetsThisWeek++;
            if (s.weightKg && s.reps) {
              volumeThisWeek += s.weightKg * s.reps;
            }
          }
        }
      }
    }

    const workoutsThisWeek = weekWorkouts.length;
    const dateFormatted = formatInAthleteTimeZone(now, { weekday: 'long', month: 'short', day: 'numeric' });
    const subtext = `${dateFormatted} · ${workoutsThisWeek} workout${workoutsThisWeek === 1 ? '' : 's'} this week`;

    // Records / PRs card
    let recordsCard: DashboardResponse['records'];
    if (prCount > 0) {
      recordsCard = {
        type: 'prs',
        value: prCount,
        label: 'PRs',
        sublabel: 'this month',
      };
    } else if (totalSetsThisWeek > 0) {
      recordsCard = {
        type: 'sets',
        value: totalSetsThisWeek,
        label: 'SETS',
        sublabel: 'this week',
      };
    } else {
      recordsCard = {
        type: 'workouts',
        value: totalWorkoutsCount,
        label: 'WORKOUTS',
        sublabel: 'logged',
      };
    }

    // Muscle Coverage (fallback to 14 days if current week has no workouts yet)
    let muscleExposure = initialMuscleExposure;
    if (!muscleExposure.hasData && totalWorkoutsCount > 0) {
      const recentStart = new Date(now);
      recentStart.setDate(recentStart.getDate() - 14);
      muscleExposure = await getDateRangeMuscleExposure(recentStart, now);
    }

    const allExposureList = [
      ...muscleExposure.mostExposure,
      ...muscleExposure.moderateExposure,
      ...muscleExposure.lowerExposure,
    ];

    const sortedMuscles = [...allExposureList].sort((a, b) => b.workingSets - a.workingSets);
    const maxSets = sortedMuscles.length > 0 ? Math.max(sortedMuscles[0].workingSets, 1) : 1;
    const topMuscles = sortedMuscles.slice(0, 3).map((m) => ({
      displayName: m.displayName,
      sets: m.workingSets,
      percentage: Math.min(100, Math.round((m.workingSets / maxSets) * 100)),
    }));

    // Parallel fetch of history items for distinct exercises (eliminates N+1 loop)
    const strengthHistoryItems = await Promise.all(
      distinctExercises.map((ex) =>
        prisma.workoutExercise.findMany({
          where: { exerciseId: ex.id },
          select: {
            sets: {
              where: { setType: { not: 'WARMUP' } },
              select: { weightKg: true, reps: true, setIndex: true },
              orderBy: { setIndex: 'asc' },
            },
            workout: { select: { performedAt: true } },
          },
          orderBy: { workout: { performedAt: 'desc' } },
          take: 2,
        })
      )
    );

    const strengthMovers: DashboardResponse['strengthMovers'] = [];
    for (let i = 0; i < distinctExercises.length; i++) {
      const ex = distinctExercises[i];
      const historyItems = strengthHistoryItems[i];

      if (historyItems && historyItems.length >= 2) {
        const latestSession = historyItems[0];
        const previousSession = historyItems[1];

        const latestMaxWeight = Math.max(...latestSession.sets.map((s) => s.weightKg ?? 0), 0);
        const prevMaxWeight = Math.max(...previousSession.sets.map((s) => s.weightKg ?? 0), 0);

        if (latestMaxWeight > 0 && prevMaxWeight > 0) {
          const weightDiff = latestMaxWeight - prevMaxWeight;
          if (weightDiff > 0) {
            strengthMovers.push({
              exerciseName: ex.canonicalName,
              trend: 'up',
              changeText: `+${weightDiff} kg`,
            });
          } else if (weightDiff < 0) {
            strengthMovers.push({
              exerciseName: ex.canonicalName,
              trend: 'down',
              changeText: `${weightDiff} kg`,
            });
          } else {
            const latestTopReps = Math.max(
              ...latestSession.sets.filter((s) => (s.weightKg ?? 0) === latestMaxWeight).map((s) => s.reps ?? 0),
              0
            );
            const prevTopReps = Math.max(
              ...previousSession.sets.filter((s) => (s.weightKg ?? 0) === prevMaxWeight).map((s) => s.reps ?? 0),
              0
            );
            const repsDiff = latestTopReps - prevTopReps;
            if (repsDiff > 0) {
              strengthMovers.push({
                exerciseName: ex.canonicalName,
                trend: 'up',
                changeText: `+${repsDiff} reps`,
              });
            } else if (repsDiff < 0) {
              strengthMovers.push({
                exerciseName: ex.canonicalName,
                trend: 'down',
                changeText: `${repsDiff} reps`,
              });
            } else {
              strengthMovers.push({
                exerciseName: ex.canonicalName,
                trend: 'stable',
                changeText: 'Stable',
              });
            }
          }
        }
      }

      if (strengthMovers.length >= 3) break;
    }

    // Coach Snapshot
    let coachSnapshot: DashboardResponse['coachSnapshot'];
    if (observation) {
      coachSnapshot = {
        hasInsight: true,
        insight: observation.content,
        ctaText: 'View →',
        ctaHref: '/coach',
      };
    } else if (totalWorkoutsCount > 0) {
      coachSnapshot = {
        hasInsight: false,
        insight: 'No coaching insight generated yet.',
        ctaText: 'Analyze workout',
        ctaHref: weekWorkouts[0]?.id ? `/analyze/${weekWorkouts[0].id}` : '/coach',
      };
    } else {
      coachSnapshot = {
        hasInsight: false,
        insight: 'Coach activates after your first workout.',
        ctaText: 'Ask Coach',
        ctaHref: '/coach',
      };
    }

    // Latest Workout formatting
    let latestWorkout: DashboardResponse['latestWorkout'] = null;
    if (latest) {
      const setsCount = latest.exercises.reduce(
        (sum, ex) => sum + ex.sets.filter((s) => s.setType !== 'WARMUP').length,
        0
      );
      latestWorkout = {
        id: latest.id,
        name: latest.name || 'Workout',
        performedAt: latest.performedAt.toISOString(),
        formattedDate: formatInAthleteTimeZone(new Date(latest.performedAt), { month: 'short', day: 'numeric' }),
        setsCount,
        exercisesCount: latest.exercises.length,
      };
    }

    if (process.env.NODE_ENV === 'development') {
      const elapsed = Date.now() - startTime;
      console.log(`[PERF] /api/dashboard parallel execution completed in ${elapsed}ms`);
    }

    const responseData: DashboardResponse = {
      athlete: {
        name: userName,
        greeting,
        subtext,
      },
      training: {
        workoutsThisWeek,
        weekDays,
        totalSetsThisWeek,
        volumeThisWeek: Math.round(volumeThisWeek),
      },
      records: recordsCard,
      muscleCoverage: {
        hasData: muscleExposure.hasData,
        bodyState: muscleExposure.bodyState,
        topMuscles,
      },
      strengthMovers,
      coachSnapshot,
      latestWorkout,
    };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    );
  }
}
