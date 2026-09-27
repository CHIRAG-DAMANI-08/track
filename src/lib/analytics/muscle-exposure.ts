import { prisma } from '@/lib/db';
import { CANONICAL_MUSCLES } from '@/lib/muscles/taxonomy';
import { resolveExerciseMuscles } from '@/lib/muscles/normalize';
import type {
  MuscleMapState,
  MuscleExposureDetail,
  MuscleContributor,
  ExposureLevel,
  TrendDirection,
} from '@/components/anatomy/muscle-map.types';

/**
 * =====================================================================
 * DETERMINISTIC MUSCLE EXPOSURE CALCULATION ENGINE
 * =====================================================================
 * 
 * Philosophy:
 * - Deterministic, objective representation of recorded training volume.
 * - This is TRAINING EXPOSURE based on logged working sets, NOT EMG data
 *   and NOT a scientific claim of physiological muscle activation.
 * 
 * Weighting Formula:
 * - PRIMARY: weight = 1.0 (Direct primary mover, e.g. Chest on Bench Press)
 * - SECONDARY: weight = 0.5 (Synergist / secondary mover, e.g. Triceps on Bench Press)
 * - TERTIARY: weight = 0.25 (Stabilizer / minor contribution, e.g. Front Delts on Incline)
 * 
 * For each exercise in the window:
 *   working_sets = count(set where setType != 'WARMUP')
 *   For each mapped muscle:
 *     exposure_score += working_sets * emphasis_weight
 * 
 * Visualization Intensity (0–10 scale for body-muscles):
 * - If max_exposure_score > 0:
 *     intensity = Math.round((muscle_score / max_score) * 10)
 *     clamped to 1..10 for any trained muscle
 * - Categorization:
 *     - High: intensity >= 7
 *     - Moderate: 3 <= intensity < 7
 *     - Low: intensity < 3
 */

const EMPHASIS_WEIGHTS = {
  PRIMARY: 1.0,
  SECONDARY: 0.5,
  TERTIARY: 0.25,
} as const;

import type { MuscleRole, MuscleConfidence } from '@prisma/client';

export interface WorkoutWithExercisesInput {
  id: string;
  name?: string | null;
  exercises: Array<{
    sets: Array<{ setType: string }>;
    exercise: {
      id: string;
      canonicalName: string;
      primaryMuscle?: string | null;
      secondaryMuscles?: string[];
      muscleMaps?: Array<{
        muscleGroup: string;
        role: MuscleRole;
        confidence: MuscleConfidence;
        source?: string;
      }>;
    };
  }>;
}

/**
 * Calculates muscle exposure for a single workout session.
 */
export async function getWorkoutMuscleExposure(
  workoutOrId: string | WorkoutWithExercisesInput
): Promise<MuscleMapState> {
  const workout =
    typeof workoutOrId === 'object' && workoutOrId !== null
      ? (workoutOrId as WorkoutWithExercisesInput)
      : await prisma.workout.findUnique({
          where: { id: workoutOrId },
          include: {
            exercises: {
              include: {
                sets: true,
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

  if (!workout || workout.exercises.length === 0) {
    return createEmptyMuscleMapState();
  }

  // Intermediate accumulator
  const muscleMap = new Map<
    string,
    {
      score: number;
      workingSets: number;
      contributors: Map<string, MuscleContributor>;
    }
  >();

  const unmappedList: Array<{ id: string; name: string; sets: number }> = [];
  let totalWorkingSets = 0;

  for (const we of workout.exercises) {
    const workingSets = we.sets.filter((s: { setType: string }) => s.setType !== 'WARMUP').length;
    if (workingSets === 0) continue;
    totalWorkingSets += workingSets;

    const mappedMuscles = await resolveExerciseMuscles(we.exercise);

    if (mappedMuscles.length === 0) {
      unmappedList.push({
        id: we.exercise.id,
        name: we.exercise.canonicalName,
        sets: workingSets,
      });
      continue;
    }

    for (const mapping of mappedMuscles) {
      const weight = EMPHASIS_WEIGHTS[mapping.role] ?? 0.5;
      const scoreContribution = workingSets * weight;

      if (!muscleMap.has(mapping.canonicalMuscleId)) {
        muscleMap.set(mapping.canonicalMuscleId, {
          score: 0,
          workingSets: 0,
          contributors: new Map(),
        });
      }

      const entry = muscleMap.get(mapping.canonicalMuscleId)!;
      entry.score += scoreContribution;
      entry.workingSets += workingSets;

      const contribKey = `${we.exercise.id}-${mapping.role}`;
      if (!entry.contributors.has(contribKey)) {
        entry.contributors.set(contribKey, {
          exerciseId: we.exercise.id,
          exerciseName: we.exercise.canonicalName,
          workingSets: 0,
          emphasis: mapping.role,
          workoutCount: 1,
          workoutNames: [workout.name ?? 'Workout'],
        });
      }
      entry.contributors.get(contribKey)!.workingSets += workingSets;
    }
  }

  return assembleMuscleMapState({
    muscleMap,
    workoutCount: 1,
    totalWorkingSets,
    unmappedList,
  });
}

/**
 * Calculates muscle exposure for a date range (e.g. This Week, Last Week, 4 Weeks).
 */
export async function getDateRangeMuscleExposure(
  startDate: Date,
  endDate: Date
): Promise<MuscleMapState> {
  const durationMs = endDate.getTime() - startDate.getTime();
  const priorStart = new Date(startDate.getTime() - durationMs);
  const priorEnd = new Date(startDate.getTime());

  const workoutInclude = {
    exercises: {
      include: {
        sets: {
          where: { setType: { not: 'WARMUP' as const } },
        },
        exercise: {
          include: {
            muscleMaps: true,
          },
        },
      },
    },
  };

  const [workouts, priorWorkouts] = await Promise.all([
    prisma.workout.findMany({
      where: {
        performedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: workoutInclude,
      orderBy: { performedAt: 'asc' },
    }),
    prisma.workout.findMany({
      where: {
        performedAt: {
          gte: priorStart,
          lt: priorEnd,
        },
      },
      include: workoutInclude,
    }),
  ]);

  if (workouts.length === 0) {
    return createEmptyMuscleMapState();
  }

  // Calculate prior scores by muscle
  const priorMuscleScores = new Map<string, number>();
  for (const pw of priorWorkouts) {
    for (const we of pw.exercises) {
      const workingSets = we.sets.filter(s => s.setType !== 'WARMUP').length;
      if (workingSets === 0) continue;
      const mapped = await resolveExerciseMuscles(we.exercise);
      for (const m of mapped) {
        const weight = EMPHASIS_WEIGHTS[m.role] ?? 0.5;
        priorMuscleScores.set(
          m.canonicalMuscleId,
          (priorMuscleScores.get(m.canonicalMuscleId) ?? 0) + workingSets * weight
        );
      }
    }
  }

  // Aggregate current period
  const muscleMap = new Map<
    string,
    {
      score: number;
      workingSets: number;
      workoutIds: Set<string>;
      contributors: Map<string, MuscleContributor>;
    }
  >();

  const unmappedSet = new Map<string, { id: string; name: string; sets: number }>();
  let totalWorkingSets = 0;

  for (const workout of workouts) {
    for (const we of workout.exercises) {
      const workingSets = we.sets.filter(s => s.setType !== 'WARMUP').length;
      if (workingSets === 0) continue;
      totalWorkingSets += workingSets;

      const mappedMuscles = await resolveExerciseMuscles(we.exercise);

      if (mappedMuscles.length === 0) {
        const existing = unmappedSet.get(we.exercise.id);
        if (existing) {
          existing.sets += workingSets;
        } else {
          unmappedSet.set(we.exercise.id, {
            id: we.exercise.id,
            name: we.exercise.canonicalName,
            sets: workingSets,
          });
        }
        continue;
      }

      for (const mapping of mappedMuscles) {
        const weight = EMPHASIS_WEIGHTS[mapping.role] ?? 0.5;
        const scoreContribution = workingSets * weight;

        if (!muscleMap.has(mapping.canonicalMuscleId)) {
          muscleMap.set(mapping.canonicalMuscleId, {
            score: 0,
            workingSets: 0,
            workoutIds: new Set(),
            contributors: new Map(),
          });
        }

        const entry = muscleMap.get(mapping.canonicalMuscleId)!;
        entry.score += scoreContribution;
        entry.workingSets += workingSets;
        entry.workoutIds.add(workout.id);

        const contribKey = `${we.exercise.id}-${mapping.role}`;
        if (!entry.contributors.has(contribKey)) {
          entry.contributors.set(contribKey, {
            exerciseId: we.exercise.id,
            exerciseName: we.exercise.canonicalName,
            workingSets: 0,
            emphasis: mapping.role,
            workoutCount: 0,
            workoutNames: [],
          });
        }
        const contrib = entry.contributors.get(contribKey)!;
        contrib.workingSets += workingSets;
        if (!contrib.workoutNames?.includes(workout.name ?? 'Workout')) {
          contrib.workoutNames = [...(contrib.workoutNames ?? []), workout.name ?? 'Workout'];
          contrib.workoutCount = (contrib.workoutCount ?? 0) + 1;
        }
      }
    }
  }

  return assembleMuscleMapState({
    muscleMap,
    workoutCount: workouts.length,
    totalWorkingSets,
    unmappedList: Array.from(unmappedSet.values()),
    priorScores: priorWorkouts.length > 0 ? priorMuscleScores : null,
  });
}

// ─── Assembly Helper ──────────────────────────────────────────

function assembleMuscleMapState(params: {
  muscleMap: Map<
    string,
    {
      score: number;
      workingSets: number;
      workoutIds?: Set<string>;
      contributors: Map<string, MuscleContributor>;
    }
  >;
  workoutCount: number;
  totalWorkingSets: number;
  unmappedList: Array<{ id: string; name: string; sets: number }>;
  priorScores?: Map<string, number> | null;
}): MuscleMapState {
  const { muscleMap, workoutCount, totalWorkingSets, unmappedList, priorScores } = params;

  if (muscleMap.size === 0) {
    return {
      hasData: false,
      totalWorkouts: workoutCount,
      totalWorkingSets,
      bodyState: {},
      muscles: {},
      mostExposure: [],
      moderateExposure: [],
      lowerExposure: [],
      unmappedExercises: unmappedList,
    };
  }

  // Find max exposure score for relative normalization
  let maxScore = 0;
  for (const entry of muscleMap.values()) {
    if (entry.score > maxScore) maxScore = entry.score;
  }

  const bodyState: Record<string, { intensity: number; selected: boolean }> = {};
  const muscles: Record<string, MuscleExposureDetail> = {};

  const mostExposure: MuscleExposureDetail[] = [];
  const moderateExposure: MuscleExposureDetail[] = [];
  const lowerExposure: MuscleExposureDetail[] = [];

  for (const [canonicalId, entry] of muscleMap.entries()) {
    const def = CANONICAL_MUSCLES[canonicalId];
    if (!def) continue;

    // Normalization to 0-10
    const normalizedIntensity = maxScore > 0
      ? Math.max(1, Math.min(10, Math.round((entry.score / maxScore) * 10)))
      : 0;

    let exposureLevel: ExposureLevel = 'Moderate';
    if (normalizedIntensity >= 7) {
      exposureLevel = 'High';
    } else if (normalizedIntensity < 3) {
      exposureLevel = 'Low';
    }

    // Trend calculation
    let trend: TrendDirection = null;
    let trendText = 'Not enough history to determine a trend.';

    if (priorScores) {
      const priorScore = priorScores.get(canonicalId) ?? 0;
      if (priorScore > 0) {
        const delta = (entry.score - priorScore) / priorScore;
        if (delta > 0.15) {
          trend = 'increasing';
          trendText = `↑ +${Math.round(delta * 100)}% vs previous period`;
        } else if (delta < -0.15) {
          trend = 'decreasing';
          trendText = `↓ ${Math.round(delta * 100)}% vs previous period`;
        } else {
          trend = 'consistent';
          trendText = `→ Consistent with previous period`;
        }
      } else {
        trend = 'increasing';
        trendText = `↑ Newly targeted this period`;
      }
    }

    const detail: MuscleExposureDetail = {
      muscleId: canonicalId,
      displayName: def.name,
      category: def.category,
      defaultView: def.defaultView,
      exposureScore: Math.round(entry.score * 10) / 10,
      normalizedIntensity,
      exposureLevel,
      workingSets: entry.workingSets,
      workoutCount: entry.workoutIds ? entry.workoutIds.size : workoutCount,
      contributors: Array.from(entry.contributors.values()).sort(
        (a, b) => b.workingSets - a.workingSets
      ),
      trend,
      trendText,
    };

    muscles[canonicalId] = detail;

    // Assign to tiers
    if (exposureLevel === 'High') mostExposure.push(detail);
    else if (exposureLevel === 'Moderate') moderateExposure.push(detail);
    else lowerExposure.push(detail);

    // Apply to bodyState SVG paths
    for (const svgId of def.bodyMuscleIds) {
      bodyState[svgId] = {
        intensity: normalizedIntensity,
        selected: false,
      };
    }
  }

  // Sort tiers by score descending
  mostExposure.sort((a, b) => b.exposureScore - a.exposureScore);
  moderateExposure.sort((a, b) => b.exposureScore - a.exposureScore);
  lowerExposure.sort((a, b) => b.exposureScore - a.exposureScore);

  return {
    hasData: true,
    totalWorkouts: workoutCount,
    totalWorkingSets,
    bodyState,
    muscles,
    mostExposure,
    moderateExposure,
    lowerExposure,
    unmappedExercises: unmappedList,
  };
}

function createEmptyMuscleMapState(): MuscleMapState {
  return {
    hasData: false,
    totalWorkouts: 0,
    totalWorkingSets: 0,
    bodyState: {},
    muscles: {},
    mostExposure: [],
    moderateExposure: [],
    lowerExposure: [],
    unmappedExercises: [],
  };
}
