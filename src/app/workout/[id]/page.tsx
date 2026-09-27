'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Trash2, Brain, Dumbbell, Calendar, Target } from 'lucide-react';
import { format } from 'date-fns';
import { MuscleMap, MuscleMapSheet, type MuscleExposureDetail } from '@/components/anatomy';

export default function WorkoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const workoutId = params.id as string;
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleExposureDetail | null>(null);

  const { data: resData, isLoading, error } = useQuery({
    queryKey: ['workout', workoutId],
    queryFn: async () => {
      const res = await fetch(`/api/workouts?id=${workoutId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workouts?id=${workoutId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      router.push('/');
    },
  });

  if (isLoading) {
    return (
      <div className="page-content flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
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
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{workout.name ?? 'Workout'}</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              <Calendar size={12} className="inline mr-1" />
              {format(new Date(workout.performedAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push(`/analyze/${workoutId}`)}
            className="btn-ghost p-2"
            aria-label="Analyze with coach"
          >
            <Brain size={18} style={{ color: 'var(--color-accent)' }} />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this workout?')) deleteMutation.mutate();
            }}
            className="btn-ghost p-2"
            aria-label="Delete workout"
          >
            <Trash2 size={18} style={{ color: 'var(--color-error)' }} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{stats.totalSets}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Sets</p>
          </div>
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{Math.round(stats.totalVolume).toLocaleString()}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Volume (kg)</p>
          </div>
          <div className="card-compact text-center">
            <p className="text-lg font-bold">{workout.exercises.length}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Exercises</p>
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
              <MuscleMap
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
            <p className="mb-2">Muscle mapping isn't available for this workout yet.</p>
            <button
              onClick={() => router.push('/more/exercises')}
              className="btn-ghost text-xs underline text-indigo-400"
            >
              Assign muscles in Exercise Library
            </button>
          </div>
        )}

        {muscleExposure?.unmappedExercises && muscleExposure.unmappedExercises.length > 0 && (
          <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-xs text-amber-400/90">
            <span>{muscleExposure.unmappedExercises.length} unmapped exercise(s)</span>
            <button
              onClick={() => router.push('/more/exercises')}
              className="underline hover:text-amber-300"
            >
              Review
            </button>
          </div>
        )}
      </div>

      {/* Exercises */}
      {workout.exercises.map((ex: {
        id: string;
        exercise: { id: string; canonicalName: string; primaryMuscle: string | null };
        rawName: string;
        sets: Array<{
          id: string;
          setIndex: number;
          setType: string;
          weightKg: number | null;
          reps: number | null;
          rpe: number | null;
          isPersonalRecord: boolean;
        }>;
      }) => {
        const comp = comparison?.find(
          (c: { exerciseName: string }) => c.exerciseName === ex.exercise.canonicalName
        );

        return (
          <div key={ex.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => router.push(`/exercise/${ex.exercise.id}`)}
                className="text-left"
              >
                <h3 className="font-semibold text-sm">{ex.exercise.canonicalName}</h3>
                {ex.exercise.primaryMuscle && (
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {ex.exercise.primaryMuscle}
                  </span>
                )}
              </button>
              {comp?.volumeChange !== null && comp?.volumeChange !== undefined && (
                <span className={`badge ${comp.volumeChange >= 0 ? 'badge-success' : 'badge-warning'}`}>
                  {comp.volumeChange > 0 ? '+' : ''}{comp.volumeChange}%
                </span>
              )}
            </div>

            <div className="space-y-1">
              {ex.sets.map((set) => (
                <div key={set.id} className="flex items-center gap-3 py-1 text-sm">
                  <span className="w-6 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {set.setType === 'WARMUP' ? 'W' : set.setIndex + 1}
                  </span>
                  <span className="flex-1">
                    {set.weightKg !== null ? `${set.weightKg} kg` : '—'}
                    {' × '}
                    {set.reps !== null ? `${set.reps}` : '—'}
                  </span>
                  {set.rpe !== null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      @{set.rpe}
                    </span>
                  )}
                  {set.isPersonalRecord && (
                    <span className="badge badge-accent text-xs">PR</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Bottom Sheet Detail */}
      <MuscleMapSheet
        muscle={selectedMuscle}
        onClose={() => setSelectedMuscle(null)}
        onViewExercise={(exId) => {
          setSelectedMuscle(null);
          router.push(`/exercise/${exId}`);
        }}
      />
    </div>
  );
}
