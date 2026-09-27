import { normalizeMuscleGroup, CANONICAL_MUSCLES } from './taxonomy';
import { findConservativeMuscleMapping } from './mappings';
import type { MuscleRole, MuscleConfidence } from '@prisma/client';

export interface ResolvedExerciseMuscle {
  canonicalMuscleId: string;
  role: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  confidence: 'VERIFIED' | 'ESTIMATED' | 'UNKNOWN';
  source: string;
}

/**
 * Resolves the active muscle mappings for an exercise.
 * Priority:
 * 1. Explicit ExerciseMuscleMap records from database
 * 2. Exercise primaryMuscle and secondaryMuscles fields
 * 3. Conservative rule-based catalog fallback
 * 4. Empty array (explicitly unmapped)
 */
export async function resolveExerciseMuscles(exercise: {
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
}): Promise<ResolvedExerciseMuscle[]> {
  // 1. If explicit muscleMaps exist on the exercise
  if (exercise.muscleMaps && exercise.muscleMaps.length > 0) {
    const list: ResolvedExerciseMuscle[] = [];
    for (const map of exercise.muscleMaps) {
      const canonicalId = normalizeMuscleGroup(map.muscleGroup);
      if (canonicalId && CANONICAL_MUSCLES[canonicalId]) {
        list.push({
          canonicalMuscleId: canonicalId,
          role: map.role === 'TERTIARY' ? 'TERTIARY' : map.role === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
          confidence: map.confidence ?? 'ESTIMATED',
          source: map.source ?? 'database',
        });
      }
    }
    if (list.length > 0) return list;
  }

  // 2. If primaryMuscle / secondaryMuscles are populated
  if (exercise.primaryMuscle) {
    const list: ResolvedExerciseMuscle[] = [];
    const primaryId = normalizeMuscleGroup(exercise.primaryMuscle);
    if (primaryId && CANONICAL_MUSCLES[primaryId]) {
      list.push({
        canonicalMuscleId: primaryId,
        role: 'PRIMARY',
        confidence: 'ESTIMATED',
        source: 'legacy_fields',
      });
    }

    if (exercise.secondaryMuscles && Array.isArray(exercise.secondaryMuscles)) {
      for (const sec of exercise.secondaryMuscles) {
        const secId = normalizeMuscleGroup(sec);
        if (secId && CANONICAL_MUSCLES[secId] && secId !== primaryId) {
          list.push({
            canonicalMuscleId: secId,
            role: 'SECONDARY',
            confidence: 'ESTIMATED',
            source: 'legacy_fields',
          });
        }
      }
    }

    if (list.length > 0) return list;
  }

  // 3. Fallback to conservative rule-based matching
  const ruleMatch = findConservativeMuscleMapping(exercise.canonicalName);
  if (ruleMatch) {
    const list: ResolvedExerciseMuscle[] = [
      {
        canonicalMuscleId: ruleMatch.primary,
        role: 'PRIMARY',
        confidence: 'ESTIMATED',
        source: 'rule_based',
      },
      ...ruleMatch.secondary.map(m => ({
        canonicalMuscleId: m,
        role: 'SECONDARY' as const,
        confidence: 'ESTIMATED' as const,
        source: 'rule_based',
      })),
      ...ruleMatch.tertiary.map(m => ({
        canonicalMuscleId: m,
        role: 'TERTIARY' as const,
        confidence: 'ESTIMATED' as const,
        source: 'rule_based',
      })),
    ];
    return list;
  }

  // 4. Return empty array (unmapped)
  return [];
}
