import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPersonalizedAthleteProfile } from '@/lib/personalization/context';
import { getTimeAwareGreeting } from '@/lib/personalization/greeting';
import { getDateRangeMuscleExposure } from '@/lib/analytics/muscle-exposure';
import { format } from 'date-fns';

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
  try {
    const profile = await getPersonalizedAthleteProfile();
    const userName = profile.displayName || profile.firstName || 'Chirag';
    const greeting = getTimeAwareGreeting(userName);

    const now = new Date();

    // 1. Current Week calculation (Monday to Sunday)
    const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Query workouts this week
    const weekWorkouts = await prisma.workout.findMany({
      where: {
        performedAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      include: {
        exercises: {
          include: { sets: true },
        },
      },
      orderBy: { performedAt: 'desc' },
    });

    const totalWorkoutsCount = await prisma.workout.count();

    // Calculate week days status
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayDateString = now.toDateString();

    const weekDays = dayLabels.map((dayLabel, index) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + index);
      const dString = d.toDateString();

      const active = weekWorkouts.some(
        (w) => new Date(w.performedAt).toDateString() === dString
      );

      return {
        day: dayLabel,
        date: d.toISOString(),
        active,
        isToday: dString === todayDateString,
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
    const subtext = `${format(now, 'EEEE, MMM d')} · ${workoutsThisWeek} workout${workoutsThisWeek === 1 ? '' : 's'} this week`;

    // 2. Records / PRs this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prCount = await prisma.exerciseSet.count({
      where: {
        isPersonalRecord: true,
        workoutExercise: {
          workout: {
            performedAt: { gte: monthStart },
          },
        },
      },
    });

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

    // 3. Muscle Coverage (This week or recent 14 days)
    let muscleExposure = await getDateRangeMuscleExposure(weekStart, now);
    if (!muscleExposure.hasData && totalWorkoutsCount > 0) {
      // Fallback to recent 14 days to show real recent activity
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

    // 4. Strength Movers (real progress comparing 2 most recent sessions per exercise)
    const distinctExercises = await prisma.exercise.findMany({
      where: {
        workoutExercises: { some: {} },
      },
      select: { id: true, canonicalName: true },
      take: 15,
    });

    const strengthMovers: DashboardResponse['strengthMovers'] = [];
    for (const ex of distinctExercises) {
      const historyItems = await prisma.workoutExercise.findMany({
        where: { exerciseId: ex.id },
        include: {
          sets: {
            where: { setType: { not: 'WARMUP' } },
            orderBy: { setIndex: 'asc' },
          },
          workout: { select: { performedAt: true } },
        },
        orderBy: { workout: { performedAt: 'desc' } },
        take: 2,
      });

      if (historyItems.length >= 2) {
        const latest = historyItems[0];
        const previous = historyItems[1];

        const latestMaxWeight = Math.max(...latest.sets.map((s) => s.weightKg ?? 0), 0);
        const prevMaxWeight = Math.max(...previous.sets.map((s) => s.weightKg ?? 0), 0);

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
            // Check reps at max weight
            const latestTopReps = Math.max(
              ...latest.sets.filter((s) => (s.weightKg ?? 0) === latestMaxWeight).map((s) => s.reps ?? 0),
              0
            );
            const prevTopReps = Math.max(
              ...previous.sets.filter((s) => (s.weightKg ?? 0) === prevMaxWeight).map((s) => s.reps ?? 0),
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

    // 5. Coach Snapshot
    const observation =
      (await prisma.coachObservation.findFirst({
        where: {
          status: 'ACTIVE',
          type: { in: ['CONCERN', 'INTERPRETATION', 'TREND'] },
        },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await prisma.coachObservation.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      }));

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

    // 6. Latest Workout
    const latest = await prisma.workout.findFirst({
      orderBy: { performedAt: 'desc' },
      include: {
        exercises: {
          include: { sets: true },
        },
      },
    });

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
        formattedDate: format(new Date(latest.performedAt), 'MMM d'),
        setsCount,
        exercisesCount: latest.exercises.length,
      };
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

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    );
  }
}
