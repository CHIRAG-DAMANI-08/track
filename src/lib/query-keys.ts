/**
 * Centralized TanStack Query key factory.
 * All query keys in the application MUST use these factory functions.
 * This ensures consistent invalidation after import/save operations.
 */

export const queryKeys = {
  // ─── Dashboard ─────────────────────────────────────────────
  dashboard: ['dashboard'] as const,

  // ─── Workouts ──────────────────────────────────────────────
  workouts: {
    all: ['workouts'] as const,
    list: (params?: { limit?: number; offset?: number }) =>
      ['workouts', 'list', params] as const,
    detail: (id: string) => ['workouts', 'detail', id] as const,
  },

  // ─── Progress ──────────────────────────────────────────────
  progress: {
    all: ['progress'] as const,
    muscles: (range: string, customStart?: string, customEnd?: string) =>
      ['progress', 'muscles', range, customStart, customEnd] as const,
    volume: (range: string) => ['progress', 'volume', range] as const,
    strength: (range: string) => ['progress', 'strength', range] as const,
    frequency: (range: string) => ['progress', 'frequency', range] as const,
    consistency: ['progress', 'consistency'] as const,
    records: (exerciseId?: string) =>
      ['progress', 'records', exerciseId] as const,
    exercise: (exerciseId: string) =>
      ['progress', 'exercise', exerciseId] as const,
  },

  // ─── Exercise History ──────────────────────────────────────
  exercises: {
    all: ['exercises'] as const,
    detail: (id: string) => ['exercises', 'detail', id] as const,
    history: (id: string) => ['exercises', 'history', id] as const,
  },

  // ─── Coach ─────────────────────────────────────────────────
  coach: {
    all: ['coach'] as const,
    conversations: ['coach', 'conversations'] as const,
    conversation: (id: string) => ['coach', 'conversation', id] as const,
  },

  // ─── Profile ───────────────────────────────────────────────
  profile: ['profile'] as const,

  // ─── Memory ────────────────────────────────────────────────
  memory: ['memory'] as const,

  // ─── Imports ───────────────────────────────────────────────
  imports: ['imports'] as const,
} as const;

/**
 * Invalidate ALL workout-related queries after a workout is created, updated, or deleted.
 * This must be called from every mutation that changes workout data.
 */
export function workoutMutationQueryKeys() {
  return [
    queryKeys.dashboard,
    queryKeys.workouts.all,
    queryKeys.progress.all,
    queryKeys.exercises.all,
    queryKeys.imports,
  ];
}
