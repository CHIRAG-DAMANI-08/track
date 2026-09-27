'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dumbbell, TrendingUp, Brain, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImportSheet } from '@/components/import-sheet';
import { MuscleMap } from '@/components/anatomy';
import { getTimeAwareGreeting, getPersonalizedHomeSubtext } from '@/lib/personalization/greeting';

export default function TodayPage() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/profile');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: workoutData, isLoading: workoutsLoading } = useQuery({
    queryKey: ['workouts', 'recent'],
    queryFn: async () => {
      const res = await fetch('/api/workouts?limit=3');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const workouts = workoutData?.workouts ?? [];
  const latestWorkout = workouts[0] ?? null;

  const { data: latestWorkoutDetail } = useQuery({
    queryKey: ['workout', latestWorkout?.id],
    queryFn: async () => {
      const res = await fetch(`/api/workouts?id=${latestWorkout.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!latestWorkout?.id,
  });

  const { data: consistencyData } = useQuery({
    queryKey: ['progress', 'consistency'],
    queryFn: async () => {
      const res = await fetch('/api/progress?metric=consistency');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: experimentsData } = useQuery({
    queryKey: ['experiments', 'active'],
    queryFn: async () => {
      const res = await fetch('/api/experiments');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const today = new Date();
  const userName = profileData?.profile?.displayName || profileData?.profile?.firstName || 'Chirag';
  const greeting = getTimeAwareGreeting(userName);
  const activeExperiment = experimentsData?.experiments?.find((e: { status: string }) => e.status === 'ACTIVE') ?? null;
  const latestObservation = latestWorkoutDetail?.workout?.observations?.[0] ?? null;

  const homeSubtext = getPersonalizedHomeSubtext({
    userName,
    totalWorkouts: workouts.length,
    latestWorkout,
    activeExperiment,
    latestObservation,
  });

  const consistency = consistencyData?.metrics;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="pt-2">
        <p className="text-xs uppercase tracking-wider font-medium text-zinc-400">
          {format(today, 'EEEE, MMMM d')}
        </p>
        <h1 className="text-2xl font-bold mt-1 text-white">{greeting}</h1>
        {homeSubtext && (
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            {homeSubtext}
          </p>
        )}
      </div>

      {/* Import CTA */}
      <button
        onClick={() => setImportOpen(true)}
        className="btn-primary w-full text-base py-4"
      >
        <Plus size={20} />
        Import Hevy Workout
      </button>

      {/* Content */}
      {workoutsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      ) : workouts.length === 0 ? (
        /* Empty state */
        <div className="empty-state">
          <Dumbbell className="empty-state-icon" />
          <p className="empty-state-title">Nothing here yet, Chirag.</p>
          <p className="empty-state-description">
            Paste your first Hevy workout above and I&apos;ll start building your training history and learning your patterns.
          </p>
        </div>
      ) : (
        <>
          {/* Latest Workout Card */}
          {latestWorkout && (
            <div
              className="card text-left w-full cursor-pointer hover:border-white/20 transition-colors"
              onClick={() => router.push(`/workout/${latestWorkout.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push(`/workout/${latestWorkout.id}`);
                }
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Dumbbell size={16} style={{ color: 'var(--color-accent)' }} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Last Workout
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  {format(new Date(latestWorkout.performedAt), 'MMM d')}
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-bold text-lg text-white">
                  {latestWorkout.name ?? 'Workout'}
                </h3>
                <span className="text-xs text-zinc-400">
                  {latestWorkout.exercises.reduce((sum: number, ex: { sets: unknown[] }) => sum + ex.sets.length, 0)} sets · {latestWorkout.exercises.length} exercises
                </span>
              </div>

              {/* Small Body Map Preview */}
              {latestWorkoutDetail?.muscleExposure && Object.keys(latestWorkoutDetail.muscleExposure.bodyState).length > 0 && (
                <div className="py-2 flex justify-center">
                  <div className="w-[180px] pointer-events-none">
                    <MuscleMap
                      bodyState={latestWorkoutDetail.muscleExposure.bodyState}
                      compact={true}
                      showControls={false}
                      showLegend={false}
                    />
                  </div>
                </div>
              )}

              {/* Primary Muscles */}
              {latestWorkoutDetail?.muscleExposure?.primaryMuscles && latestWorkoutDetail.muscleExposure.primaryMuscles.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Primary Muscles
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {latestWorkoutDetail.muscleExposure.primaryMuscles.slice(0, 4).map((m: { muscleId: string; displayName: string }) => (
                      <span key={m.muscleId} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-zinc-200">
                        {m.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action link */}
              <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-xs font-medium text-amber-400">
                <span>View muscle map</span>
                <ChevronRight size={14} />
              </div>
            </div>
          )}

          {/* Consistency Card */}
          {consistency && consistency.totalWorkouts > 0 && (
            <button
              className="card text-left w-full"
              onClick={() => router.push('/progress')}
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} style={{ color: 'var(--color-success)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Progress
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-lg font-bold">{consistency.totalWorkouts}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Workouts</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{consistency.workoutsPerWeek}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>/week avg</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{consistency.currentStreak}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Week streak</p>
                </div>
              </div>
            </button>
          )}

          {/* Coach Card */}
          <button
            className="card text-left w-full"
            onClick={() => router.push('/coach')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain size={16} style={{ color: 'var(--color-info)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Coach
                </span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Ask your AI coach a question about your training
            </p>
          </button>
        </>
      )}

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
