import { prisma } from '@/lib/db';
import { roundTo } from '@/lib/utils';
import { getLocalWeekStart, getLocalWeekEnd, toLocalDateKey, toLocalWeekKey } from '@/lib/dates/training-calendar';

/**
 * Deterministic analytics engine.
 * All calculations trace to actual workout/set records.
 * Never fabricates data.
 */

export interface WorkoutStats {
  totalSets: number;      // ALL sets (warmup + working + drop + failure + cluster)
  workingSets: number;    // Working sets only (excludes warmup)
  warmupSets: number;     // Warmup sets only
  totalVolume: number;    // Volume from working sets (kg)
  totalReps: number;      // Reps from working sets
  exerciseCount: number;
  durationMinutes: number | null;
}

export interface ExerciseHistory {
  exerciseId: string;
  canonicalName: string;
  entries: Array<{
    date: Date;
    workoutId: string;
    sets: Array<{
      weightKg: number | null;
      reps: number | null;
      volume: number;
    }>;
    bestSet: { weightKg: number; reps: number } | null;
    totalVolume: number;
    estimated1RM: number | null;
  }>;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  type: 'weight' | 'reps' | 'volume' | 'estimated_1rm';
  value: number;
  date: Date;
  workoutId: string;
}

// ─── Workout Stats ──────────────────────────────────────────

export async function calculateWorkoutStats(workoutId: string): Promise<WorkoutStats> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      exercises: {
        include: { sets: true },
      },
    },
  });

  if (!workout) throw new Error(`Workout ${workoutId} not found`);

  let totalSets = 0;
  let workingSets = 0;
  let warmupSets = 0;
  let totalVolume = 0;
  let totalReps = 0;

  for (const ex of workout.exercises) {
    for (const set of ex.sets) {
      totalSets++;
      if (set.setType === 'WARMUP') {
        warmupSets++;
        continue;
      }
      workingSets++;
      if (set.reps) totalReps += set.reps;
      if (set.weightKg && set.reps) {
        totalVolume += set.weightKg * set.reps;
      }
    }
  }

  return {
    totalSets,
    workingSets,
    warmupSets,
    totalVolume: roundTo(totalVolume, 1),
    totalReps,
    exerciseCount: workout.exercises.length,
    durationMinutes: workout.durationMinutes,
  };
}

/**
 * Rebuild derived metrics for a specific workout idempotently.
 * Deletes any existing metrics for the workout and recomputes them.
 */
export async function rebuildWorkoutDerivedMetrics(workoutId: string): Promise<void> {
  const stats = await calculateWorkoutStats(workoutId);

  await prisma.derivedMetric.deleteMany({
    where: { workoutId },
  });

  await prisma.derivedMetric.createMany({
    data: [
      { workoutId, metricType: 'volume', metricKey: 'total_volume', value: stats.totalVolume, unit: 'kg' },
      { workoutId, metricType: 'volume', metricKey: 'working_sets', value: stats.workingSets, unit: 'sets' },
      { workoutId, metricType: 'volume', metricKey: 'warmup_sets', value: stats.warmupSets, unit: 'sets' },
      { workoutId, metricType: 'volume', metricKey: 'total_sets', value: stats.totalSets, unit: 'sets' },
      { workoutId, metricType: 'volume', metricKey: 'total_reps', value: stats.totalReps, unit: 'reps' },
    ],
  });
}

/**
 * Rebuild derived metrics for all workouts in the database idempotently.
 */
export async function rebuildAllDerivedMetrics(): Promise<number> {
  const workouts = await prisma.workout.findMany({
    select: { id: true },
  });

  for (const w of workouts) {
    await rebuildWorkoutDerivedMetrics(w.id);
  }

  return workouts.length;
}

// ─── Exercise History ───────────────────────────────────────

export async function getExerciseHistory(
  exerciseId: string,
  limit?: number
): Promise<ExerciseHistory | null> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
  });
  if (!exercise) return null;

  const workoutExercises = await prisma.workoutExercise.findMany({
    where: { exerciseId },
    include: {
      sets: { orderBy: { setIndex: 'asc' } },
      workout: { select: { id: true, performedAt: true } },
    },
    orderBy: { workout: { performedAt: 'desc' } },
    take: limit ?? 100,
  });

  const entries = workoutExercises.map(we => {
    const sets = we.sets
      .filter(s => s.setType !== 'WARMUP')
      .map(s => ({
        weightKg: s.weightKg,
        reps: s.reps,
        volume: (s.weightKg ?? 0) * (s.reps ?? 0),
      }));

    const totalVolume = sets.reduce((sum, s) => sum + s.volume, 0);

    // Best set = highest weight with valid reps
    const workingSets = sets.filter(s => s.weightKg && s.reps);
    const bestSet = workingSets.length > 0
      ? workingSets.reduce((best, s) =>
          (s.weightKg! > best.weightKg!) ? s : best
        )
      : null;

    const estimated1RM = bestSet?.weightKg && bestSet?.reps
      ? calculate1RM(bestSet.weightKg, bestSet.reps)
      : null;

    return {
      date: we.workout.performedAt,
      workoutId: we.workout.id,
      sets,
      bestSet: bestSet ? { weightKg: bestSet.weightKg!, reps: bestSet.reps! } : null,
      totalVolume: roundTo(totalVolume, 1),
      estimated1RM,
    };
  });

  return {
    exerciseId,
    canonicalName: exercise.canonicalName,
    entries,
  };
}

// ─── Personal Records ───────────────────────────────────────

export async function getPersonalRecords(exerciseId?: string): Promise<PersonalRecord[]> {
  const where = exerciseId ? { exerciseId } : {};
  const exercises = await prisma.workoutExercise.findMany({
    where,
    include: {
      sets: true,
      exercise: true,
      workout: { select: { id: true, performedAt: true } },
    },
  });

  const recordsByExercise = new Map<string, {
    weight: PersonalRecord | null;
    reps: PersonalRecord | null;
    volume: PersonalRecord | null;
    e1rm: PersonalRecord | null;
  }>();

  for (const we of exercises) {
    const key = we.exerciseId;
    if (!recordsByExercise.has(key)) {
      recordsByExercise.set(key, { weight: null, reps: null, volume: null, e1rm: null });
    }
    const records = recordsByExercise.get(key)!;

    for (const set of we.sets) {
      if (set.setType === 'WARMUP') continue;

      // Weight PR
      if (set.weightKg && (!records.weight || set.weightKg > records.weight.value)) {
        records.weight = {
          exerciseId: key,
          exerciseName: we.exercise.canonicalName,
          type: 'weight',
          value: set.weightKg,
          date: we.workout.performedAt,
          workoutId: we.workout.id,
        };
      }

      // Reps PR
      if (set.reps && (!records.reps || set.reps > records.reps.value)) {
        records.reps = {
          exerciseId: key,
          exerciseName: we.exercise.canonicalName,
          type: 'reps',
          value: set.reps,
          date: we.workout.performedAt,
          workoutId: we.workout.id,
        };
      }

      // Volume per set
      const vol = (set.weightKg ?? 0) * (set.reps ?? 0);
      if (vol > 0 && (!records.volume || vol > records.volume.value)) {
        records.volume = {
          exerciseId: key,
          exerciseName: we.exercise.canonicalName,
          type: 'volume',
          value: roundTo(vol, 1),
          date: we.workout.performedAt,
          workoutId: we.workout.id,
        };
      }

      // Estimated 1RM PR
      if (set.weightKg && set.reps && set.reps <= 12) {
        const e1rm = calculate1RM(set.weightKg, set.reps);
        if (e1rm && (!records.e1rm || e1rm > records.e1rm.value)) {
          records.e1rm = {
            exerciseId: key,
            exerciseName: we.exercise.canonicalName,
            type: 'estimated_1rm',
            value: e1rm,
            date: we.workout.performedAt,
            workoutId: we.workout.id,
          };
        }
      }
    }
  }

  const allRecords: PersonalRecord[] = [];
  for (const records of recordsByExercise.values()) {
    if (records.weight) allRecords.push(records.weight);
    if (records.reps) allRecords.push(records.reps);
    if (records.volume) allRecords.push(records.volume);
    if (records.e1rm) allRecords.push(records.e1rm);
  }

  return allRecords;
}

// ─── Volume Trends ──────────────────────────────────────────

export interface VolumeTrend {
  period: string;
  startDate: Date;
  endDate: Date;
  totalVolume: number;
  totalSets: number;
  sessionCount: number;
}

export async function getWeeklyVolumeTrends(weeks: number = 12): Promise<VolumeTrend[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const workouts = await prisma.workout.findMany({
    where: { performedAt: { gte: cutoff } },
    include: {
      exercises: {
        include: { sets: true },
      },
    },
    orderBy: { performedAt: 'asc' },
  });

  // Group by ISO week
  const weekMap = new Map<string, VolumeTrend>();

  for (const workout of workouts) {
    const weekStart = getLocalWeekStart(workout.performedAt);
    const key = toLocalWeekKey(workout.performedAt);

    if (!weekMap.has(key)) {
      const weekEnd = getLocalWeekEnd(workout.performedAt);
      weekMap.set(key, {
        period: key,
        startDate: weekStart,
        endDate: weekEnd,
        totalVolume: 0,
        totalSets: 0,
        sessionCount: 0,
      });
    }

    const week = weekMap.get(key)!;
    week.sessionCount++;

    for (const ex of workout.exercises) {
      for (const set of ex.sets) {
        if (set.setType === 'WARMUP') continue;
        week.totalSets++;
        if (set.weightKg && set.reps) {
          week.totalVolume += set.weightKg * set.reps;
        }
      }
    }
  }

  return Array.from(weekMap.values()).map(w => ({
    ...w,
    totalVolume: roundTo(w.totalVolume, 0),
  }));
}

// ─── Muscle Group Exposure ──────────────────────────────────

export interface MuscleExposure {
  muscleGroup: string;
  totalSets: number;
  totalVolume: number;
  sessionsHit: number;
  lastHitDate: Date | null;
}

export async function getMuscleGroupExposure(
  days: number = 30
): Promise<MuscleExposure[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const workoutExercises = await prisma.workoutExercise.findMany({
    where: {
      workout: { performedAt: { gte: cutoff } },
    },
    include: {
      sets: true,
      exercise: {
        include: { muscleMaps: true },
      },
      workout: { select: { performedAt: true } },
    },
  });

  const muscleMap = new Map<string, MuscleExposure>();
  const muscleSessionDates = new Map<string, Set<string>>();

  for (const we of workoutExercises) {
    const muscles = we.exercise.muscleMaps;
    if (muscles.length === 0 && we.exercise.primaryMuscle) {
      muscles.push({
        id: '', exerciseId: we.exerciseId,
        muscleGroup: we.exercise.primaryMuscle,
        role: 'PRIMARY', confidence: 'ESTIMATED',
        source: 'system',
      });
    }

    for (const muscle of muscles) {
      if (!muscleMap.has(muscle.muscleGroup)) {
        muscleMap.set(muscle.muscleGroup, {
          muscleGroup: muscle.muscleGroup,
          totalSets: 0,
          totalVolume: 0,
          sessionsHit: 0,
          lastHitDate: null,
        });
        muscleSessionDates.set(muscle.muscleGroup, new Set());
      }

      const exposure = muscleMap.get(muscle.muscleGroup)!;
      const dateKey = toLocalDateKey(we.workout.performedAt);
      muscleSessionDates.get(muscle.muscleGroup)!.add(dateKey);

      for (const set of we.sets) {
        if (set.setType === 'WARMUP') continue;
        exposure.totalSets++;
        if (set.weightKg && set.reps) {
          exposure.totalVolume += set.weightKg * set.reps;
        }
      }

      if (!exposure.lastHitDate || we.workout.performedAt > exposure.lastHitDate) {
        exposure.lastHitDate = we.workout.performedAt;
      }
    }
  }

  // Set session counts
  for (const [muscle, exposure] of muscleMap) {
    exposure.sessionsHit = muscleSessionDates.get(muscle)?.size ?? 0;
    exposure.totalVolume = roundTo(exposure.totalVolume, 0);
  }

  return Array.from(muscleMap.values()).sort((a, b) => b.totalSets - a.totalSets);
}

// ─── Frequency & Consistency ────────────────────────────────

export interface ConsistencyMetrics {
  totalWorkouts: number;
  periodDays: number;
  workoutsPerWeek: number;
  currentStreak: number;
  longestStreak: number;
  lastWorkoutDate: Date | null;
  daysSinceLastWorkout: number | null;
}

export async function getConsistencyMetrics(): Promise<ConsistencyMetrics> {
  const workouts = await prisma.workout.findMany({
    select: { performedAt: true },
    orderBy: { performedAt: 'asc' },
  });

  if (workouts.length === 0) {
    return {
      totalWorkouts: 0,
      periodDays: 0,
      workoutsPerWeek: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastWorkoutDate: null,
      daysSinceLastWorkout: null,
    };
  }

  const dates = workouts.map(w => w.performedAt);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const periodDays = Math.ceil(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  const workoutsPerWeek = periodDays > 0
    ? roundTo((workouts.length / periodDays) * 7, 1)
    : workouts.length;

  // Calculate streaks (count consecutive weeks with workouts)
  const weekSet = new Set<string>();
  for (const d of dates) {
    weekSet.add(toLocalWeekKey(d));
  }

  const sortedWeeks = Array.from(weekSet).sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  for (let i = 1; i < sortedWeeks.length; i++) {
    const prevWeek = new Date(sortedWeeks[i - 1]);
    const currWeek = new Date(sortedWeeks[i]);
    const diffDays = Math.round((currWeek.getTime() - prevWeek.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Current streak: count back from latest week
  const now = new Date();
  const lastWeekKey = sortedWeeks[sortedWeeks.length - 1];

  // If the latest workout week is this week or last week, start counting
  const lastWeekDate = new Date(lastWeekKey);
  const currentWeekDate = new Date(toLocalWeekKey(now));
  const weekDiff = Math.floor(
    (currentWeekDate.getTime() - lastWeekDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
  );

  if (weekDiff <= 1) {
    currentStreak = 1;
    for (let i = sortedWeeks.length - 2; i >= 0; i--) {
      const prev = new Date(sortedWeeks[i]);
      const curr = new Date(sortedWeeks[i + 1]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 7) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  const daysSinceLastWorkout = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    totalWorkouts: workouts.length,
    periodDays,
    workoutsPerWeek,
    currentStreak,
    longestStreak,
    lastWorkoutDate: lastDate,
    daysSinceLastWorkout,
  };
}

// ─── Comparison ─────────────────────────────────────────────

export interface WorkoutComparison {
  exerciseName: string;
  current: { topWeight: number | null; topReps: number | null; volume: number };
  previous: { topWeight: number | null; topReps: number | null; volume: number } | null;
  volumeChange: number | null;
  weightChange: number | null;
}

export interface CompareWorkoutInput {
  id: string;
  performedAt: Date;
  exercises: Array<{
    exerciseId: string;
    exercise: { canonicalName: string };
    sets: Array<{ setType: string; weightKg: number | null; reps: number | null }>;
  }>;
}

export async function compareWithPrevious(
  workoutOrId: string | CompareWorkoutInput
): Promise<WorkoutComparison[]> {
  const current =
    typeof workoutOrId === 'object' && workoutOrId !== null
      ? (workoutOrId as CompareWorkoutInput)
      : await prisma.workout.findUnique({
          where: { id: workoutOrId },
          include: {
            exercises: {
              include: {
                sets: true,
                exercise: true,
              },
            },
          },
        });
  if (!current || !current.exercises) return [];

  // Run all previous exercise lookups in parallel
  const previousResults = await Promise.all(
    current.exercises.map((ex: CompareWorkoutInput['exercises'][number]) =>
      prisma.workoutExercise.findFirst({
        where: {
          exerciseId: ex.exerciseId,
          workout: {
            performedAt: { lt: current.performedAt },
          },
        },
        include: {
          sets: true,
          workout: { select: { performedAt: true } },
        },
        orderBy: { workout: { performedAt: 'desc' } },
      })
    )
  );

  const comparisons: WorkoutComparison[] = [];

  for (let i = 0; i < current.exercises.length; i++) {
    const ex = current.exercises[i];
    const previousWe = previousResults[i];

    const currentSets = ex.sets.filter((s: { setType: string }) => s.setType !== 'WARMUP');
    const currentTopWeight = currentSets.reduce((max: number | null, s: { weightKg: number | null }) =>
      s.weightKg && s.weightKg > (max ?? 0) ? s.weightKg : max, null as number | null);
    const currentTopReps = currentSets.reduce((max: number | null, s: { reps: number | null }) =>
      s.reps && s.reps > (max ?? 0) ? s.reps : max, null as number | null);
    const currentVolume = currentSets.reduce((sum: number, s: { weightKg: number | null; reps: number | null }) =>
      sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);

    let previous: WorkoutComparison['previous'] = null;
    let volumeChange: number | null = null;
    let weightChange: number | null = null;

    if (previousWe) {
      const prevSets = previousWe.sets.filter((s: { setType: string }) => s.setType !== 'WARMUP');
      const prevTopWeight = prevSets.reduce((max: number | null, s: { weightKg: number | null }) =>
        s.weightKg && s.weightKg > (max ?? 0) ? s.weightKg : max, null as number | null);
      const prevTopReps = prevSets.reduce((max: number | null, s: { reps: number | null }) =>
        s.reps && s.reps > (max ?? 0) ? s.reps : max, null as number | null);
      const prevVolume = prevSets.reduce((sum: number, s: { weightKg: number | null; reps: number | null }) =>
        sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);

      previous = {
        topWeight: prevTopWeight,
        topReps: prevTopReps,
        volume: roundTo(prevVolume, 1),
      };

      if (prevVolume > 0) {
        volumeChange = roundTo(((currentVolume - prevVolume) / prevVolume) * 100, 1);
      }
      if (prevTopWeight && currentTopWeight) {
        weightChange = roundTo(currentTopWeight - prevTopWeight, 1);
      }
    }

    comparisons.push({
      exerciseName: ex.exercise.canonicalName,
      current: {
        topWeight: currentTopWeight,
        topReps: currentTopReps,
        volume: roundTo(currentVolume, 1),
      },
      previous,
      volumeChange,
      weightChange,
    });
  }

  return comparisons;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Epley formula for estimated 1RM.
 * Only reliable for <= 12 reps.
 */
export function calculate1RM(weight: number, reps: number): number | null {
  if (reps <= 0 || weight <= 0) return null;
  if (reps === 1) return roundTo(weight, 1);
  if (reps > 12) return null; // Formula unreliable above 12 reps

  const e1rm = weight * (1 + reps / 30);
  return roundTo(e1rm, 1);
}
