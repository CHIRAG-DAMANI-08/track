'use client';

import { useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Brain, Calendar, Target, Check, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { MuscleMapSheet, type MuscleExposureDetail } from '@/components/anatomy';

// Lazy-load heavy anatomy visualization so initial workout metrics and exercises render instantly
const DynamicMuscleMap = dynamic(
  () => import('@/components/anatomy').then((mod) => mod.MuscleMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full flex flex-col items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
        style={{ height: 'clamp(190px, 24vh, 220px)' }}
      >
        <span className="text-xs text-zinc-500 font-medium">Loading anatomy...</span>
      </div>
    ),
  }
);

function WorkoutDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const workoutId = params.id as string;
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleExposureDetail | null>(null);

  const isJustSaved = searchParams.get('justSaved') === 'true';
  const isAnalyzing = searchParams.get('analyzing') === 'true';

  const { data: resData, isLoading, error } = useQuery({
    queryKey: ['workout', workoutId],
    queryFn: async () => {
      const res = await fetch(`/api/workouts?id=${workoutId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workouts?id=${workoutId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/');
    },
  });

  // Layered / per-component skeleton when completely uncached
  if (isLoading && !resData) {
    return (
      <div className="page-content space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="space-y-1.5 flex-1">
            <div className="h-6 w-48 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-compact h-16 bg-white/5 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="card h-48 bg-white/5 animate-pulse rounded-xl" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card h-28 bg-white/5 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const workout = resData?.workout;
  const muscleExposure = resData?.muscleExposure;
  const stats = resData?.stats;
  const comparison = resData?.comparison;

  if (error || !workout) {
    return (
      <div className="page-content">
        <div className="flex items-center gap-3 pt-2 mb-4">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Workout</h1>
        </div>
        <div className="empty-state">
          <p className="empty-state-title">Workout not found</p>
          <button onClick={() => router.push('/')} className="btn-secondary mt-4">
            Back to Today
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content space-y-3.5">
      {/* Non-blocking feedback banners */}
      {isJustSaved && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">Workout saved.</span>
          </div>
          {isAnalyzing && (
            <span className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
              <Sparkles size={13} className="text-amber-400 animate-spin" />
              Analyzing in background...
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{workout.name ?? 'Workout'}</h1>
            <p className="text-sm text-zinc-400">
              <Calendar size={12} className="inline mr-1" />
              {format(new Date(workout.performedAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push(`/analyze/${workoutId}`)}
            className="btn-ghost p-2 text-indigo-400"
            aria-label="Analyze with coach"
          >
            <Brain size={18} />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this workout?')) deleteMutation.mutate();
            }}
            className="btn-ghost p-2 text-rose-400"
            aria-label="Delete workout"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{stats.totalSets}</p>
            <p className="text-xs text-zinc-400">Sets</p>
          </div>
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{Math.round(stats.totalVolume).toLocaleString()}</p>
            <p className="text-xs text-zinc-400">Volume (kg)</p>
          </div>
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{workout.exercises.length}</p>
            <p className="text-xs text-zinc-400">Exercises</p>
          </div>
        </div>
      )}

      {/* Muscles Trained Card */}
      <div className="card p-3.5 sm:p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-indigo-400 shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Muscles Trained
            </h2>
          </div>
          {muscleExposure?.hasData && (
            <span className="text-[11px] text-zinc-400">
              Tap muscle for details
            </span>
          )}
        </div>

        {muscleExposure?.hasData ? (
          <div className="md:grid md:grid-cols-12 md:gap-6 md:items-center">
            {/* Viewport & Anatomy - centered, contained */}
            <div className="md:col-span-5 flex flex-col items-center">
              <DynamicMuscleMap
                bodyState={muscleExposure.bodyState}
                selectedMuscleId={selectedMuscle?.muscleId}
                onSelectMuscle={(id) => {
                  const m = muscleExposure.muscles[id];
                  if (m) setSelectedMuscle(m);
                }}
                compact
                showLegend={false}
                viewportHeight="clamp(190px, 24vh, 220px)"
              />
            </div>

            {/* Primary & Secondary Breakdown */}
            <div className="md:col-span-7 space-y-3 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 md:border-l border-white/5 md:pl-5">
              {muscleExposure.mostExposure.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                    Primary Targets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {muscleExposure.mostExposure.map((m: MuscleExposureDetail) => {
                      const isSelected = selectedMuscle?.muscleId === m.muscleId;
                      return (
                        <button
                          key={m.muscleId}
                          onClick={() => setSelectedMuscle(isSelected ? null : m)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                            isSelected
                              ? 'bg-indigo-500 text-white shadow-sm ring-1 ring-indigo-400'
                              : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25'
                          }`}
                        >
                          {m.displayName} · {m.workingSets}s
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {muscleExposure.moderateExposure.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
                    Secondary
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {muscleExposure.moderateExposure.map((m: MuscleExposureDetail) => {
                      const isSelected = selectedMuscle?.muscleId === m.muscleId;
                      return (
                        <button
                          key={m.muscleId}
                          onClick={() => setSelectedMuscle(isSelected ? null : m)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                            isSelected
                              ? 'bg-zinc-700 text-zinc-100 ring-1 ring-zinc-500'
                              : 'bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07]'
                          }`}
                        >
                          {m.displayName} · {m.workingSets}s
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-zinc-400">
            <p className="mb-2">Muscle mapping isn&apos;t available for this workout yet.</p>
            <button
              onClick={() => router.push('/more/exercises')}
              className="btn-ghost text-xs underline text-indigo-400"
            >
              Assign muscles in Exercise Library
            </button>
          </div>
        )}
      </div>

      {/* Exercises */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Exercises ({workout.exercises.length})
        </h2>
        {workout.exercises.map((we: {
          id: string;
          exerciseId: string;
          exercise: { canonicalName: string; primaryMuscle: string | null };
          sets: Array<{
            id: string;
            setIndex: number;
            weightKg: number | null;
            reps: number | null;
            isPersonalRecord: boolean;
          }>;
        }) => {
          const comp = comparison?.[we.exerciseId];
          return (
            <div key={we.id} className="card p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    onClick={() => router.push(`/exercise/${we.exerciseId}`)}
                    className="font-bold text-sm text-white hover:text-indigo-400 cursor-pointer"
                  >
                    {we.exercise.canonicalName}
                  </h3>
                  {we.exercise.primaryMuscle && (
                    <span className="text-[11px] text-zinc-400">
                      {we.exercise.primaryMuscle}
                    </span>
                  )}
                </div>
                {comp?.previous && (
                  <span className="text-xs text-zinc-400">
                    Prev: {comp.previous.maxWeightKg}kg × {comp.previous.maxReps}
                  </span>
                )}
              </div>

              {/* Sets Table */}
              <div className="space-y-1">
                {we.sets.map((set) => (
                  <div
                    key={set.id}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/[0.02]"
                  >
                    <span className="text-zinc-500 font-mono w-6">
                      #{set.setIndex + 1}
                    </span>
                    <span className="font-semibold text-zinc-200">
                      {set.weightKg ? `${set.weightKg} kg` : 'Bodyweight'}
                    </span>
                    <span className="text-zinc-300">
                      {set.reps ? `${set.reps} reps` : ''}
                    </span>
                    {set.isPersonalRecord && (
                      <span className="badge badge-accent text-[10px]">PR</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Muscle Detail Sheet */}
      {selectedMuscle && (
        <MuscleMapSheet
          muscle={selectedMuscle}
          onClose={() => setSelectedMuscle(null)}
          onViewExercise={(exId: string) => {
            setSelectedMuscle(null);
            router.push(`/exercise/${exId}`);
          }}
        />
      )}
    </div>
  );
}

export default function WorkoutDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="page-content space-y-4">
          <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-compact h-16 bg-white/5 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <WorkoutDetailContent />
    </Suspense>
  );
}
