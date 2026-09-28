'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Brain, Loader2, Trash2, Plus,
  AlertTriangle, Flame, Thermometer
} from 'lucide-react';
import type { ParsedWorkout, ParsedExercise, ParsedSet } from '@/lib/schemas';
import { workoutMutationQueryKeys } from '@/lib/query-keys';

function ReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const importId = searchParams.get('importId') ?? '';
  const rawText = searchParams.get('rawText') ?? '';
  const workoutDataStr = searchParams.get('data') ?? '{}';
  const warningsStr = searchParams.get('warnings') ?? '[]';

  const [workout, setWorkout] = useState<ParsedWorkout>(() => {
    try {
      return JSON.parse(workoutDataStr);
    } catch {
      return { name: null, performedAt: null, durationMinutes: null, notes: null, exercises: [] };
    }
  });

  const warnings: string[] = (() => {
    try {
      return JSON.parse(warningsStr);
    } catch {
      return [];
    }
  })();

  const [analyzeAfterSave, setAnalyzeAfterSave] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          rawImportId: importId || undefined,
          rawText: rawText || undefined,
          workout,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }
      return res.json();
    },
    onSuccess: async (data) => {
      // ─── Handle duplicate detection from save ────────────
      if (data.isDuplicate) {
        const viewExisting = confirm(
          'This workout has already been imported.\n\nWould you like to view the existing workout?'
        );
        if (viewExisting && data.existingWorkoutId) {
          router.push(`/workout/${data.existingWorkoutId}`);
        }
        return;
      }

      // ─── CRITICAL: Invalidate ALL workout-related queries ────────
      // This ensures Progress, Dashboard, Calendar, etc. all refetch
      const keysToInvalidate = workoutMutationQueryKeys();
      await Promise.all(
        keysToInvalidate.map(key =>
          queryClient.invalidateQueries({ queryKey: key })
        )
      );

      const workoutId = data.workout?.id;
      if (analyzeAfterSave && workoutId) {
        // Asynchronous background AI analysis — never blocks UI or navigation
        fetch('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analyze', workoutId }),
        }).catch((err) => console.warn('Background AI analysis error:', err));

        router.push(`/workout/${workoutId}?justSaved=true&analyzing=true`);
      } else if (workoutId) {
        router.push(`/workout/${workoutId}?justSaved=true`);
      } else {
        router.push('/');
      }
    },
  });

  const updateWorkoutField = useCallback((field: keyof ParsedWorkout, value: unknown) => {
    setWorkout(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateExercise = useCallback((idx: number, updates: Partial<ParsedExercise>) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i === idx ? { ...ex, ...updates } : ex
      ),
    }));
  }, []);

  const removeExercise = useCallback((idx: number) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== idx),
    }));
  }, []);

  const updateSet = useCallback((exIdx: number, setIdx: number, field: string, value: unknown) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i === exIdx
          ? {
              ...ex,
              sets: ex.sets.map((s, j) =>
                j === setIdx ? { ...s, [field]: value } : s
              ),
            }
          : ex
      ),
    }));
  }, []);

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
          : ex
      ),
    }));
  }, []);

  const addSet = useCallback((exIdx: number) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, i) =>
        i === exIdx
          ? {
              ...ex,
              sets: [
                ...ex.sets,
                {
                  setIndex: ex.sets.length,
                  setType: 'WORKING' as const,
                  weightKg: null,
                  weightUnit: 'kg',
                  reps: null,
                  durationSeconds: null,
                  distanceMeters: null,
                  rpe: null,
                  rir: null,
                  isPersonalRecord: false,
                  notes: null,
                },
              ],
            }
          : ex
      ),
    }));
  }, []);

  // ─── Set type display helpers ────────────────────────────
  const setTypeLabel = (type: string) => {
    switch (type) {
      case 'WARMUP': return 'WU';
      case 'WORKING': return '';
      case 'DROP': return 'DROP';
      case 'FAILURE': return 'FAIL';
      case 'CLUSTER': return 'CL';
      default: return '';
    }
  };

  const setTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'WARMUP': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'DROP': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'FAILURE': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-white/5 text-zinc-400 border-white/10';
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Review Workout</h1>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-3 rounded-lg" style={{ background: 'var(--color-warning-muted)' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
              Parser Warnings
            </span>
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="text-xs ml-5" style={{ color: 'var(--color-text-secondary)' }}>{w}</p>
          ))}
        </div>
      )}

      {/* Workout Info */}
      <div className="card">
        <label className="label">Workout Name</label>
        <input
          type="text"
          className="input mb-3"
          value={workout.name ?? ''}
          onChange={(e) => updateWorkoutField('name', e.target.value || null)}
          placeholder="e.g., Upper Body Push"
        />

        <label className="label">Date</label>
        <input
          type="date"
          className="input mb-3"
          value={workout.performedAt ? new Date(workout.performedAt).toISOString().slice(0, 10) : ''}
          onChange={(e) => updateWorkoutField('performedAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
        />

        <label className="label">Duration (minutes)</label>
        <input
          type="number"
          className="input mb-3"
          value={workout.durationMinutes ?? ''}
          onChange={(e) => updateWorkoutField('durationMinutes', e.target.value ? parseInt(e.target.value) : null)}
          placeholder="Optional"
        />

        {/* Workout Notes */}
        <label className="label">Workout Notes</label>
        <textarea
          className="textarea text-sm"
          value={workout.notes ?? ''}
          onChange={(e) => updateWorkoutField('notes', e.target.value || null)}
          placeholder="Optional workout-level notes"
          rows={2}
        />
      </div>

      {/* Exercises */}
      {workout.exercises.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No exercises parsed</p>
          <p className="empty-state-description">
            The parser could not extract exercises from the pasted text. Try adjusting the text format.
          </p>
        </div>
      ) : (
        workout.exercises.map((ex, exIdx) => (
          <div key={exIdx} className="card">
            <div className="flex items-center justify-between mb-2">
              <input
                type="text"
                className="input flex-1 mr-2 font-semibold"
                value={ex.rawName}
                onChange={(e) => updateExercise(exIdx, { rawName: e.target.value })}
              />
              <button
                onClick={() => removeExercise(exIdx)}
                className="btn-ghost p-2"
                aria-label={`Remove ${ex.rawName}`}
              >
                <Trash2 size={16} style={{ color: 'var(--color-error)' }} />
              </button>
            </div>

            {/* Exercise Note */}
            {ex.notes && (
              <div className="mb-2 px-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                📝 {ex.notes}
              </div>
            )}

            {/* Sets */}
            <div className="space-y-1.5">
              {ex.sets.map((set: ParsedSet, setIdx: number) => (
                <div key={setIdx} className="flex items-center gap-2 text-xs">
                  {/* Set Number + Type Badge */}
                  <div className="flex items-center gap-1 w-16 shrink-0">
                    <span className="text-zinc-500 font-mono w-4">{setIdx + 1}</span>
                    {set.setType !== 'WORKING' && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${setTypeBadgeClass(set.setType)}`}>
                        {setTypeLabel(set.setType)}
                      </span>
                    )}
                  </div>

                  {/* Weight */}
                  <input
                    type="number"
                    className="input py-1 px-2 text-xs w-20"
                    style={{ minHeight: '30px' }}
                    value={set.weightKg ?? ''}
                    onChange={(e) => updateSet(exIdx, setIdx, 'weightKg', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="kg"
                    step="0.5"
                  />
                  <span className="text-zinc-500">×</span>

                  {/* Reps */}
                  <input
                    type="number"
                    className="input py-1 px-2 text-xs w-14"
                    style={{ minHeight: '30px' }}
                    value={set.reps ?? ''}
                    onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="reps"
                  />

                  {/* RPE (only show if present) */}
                  {set.rpe !== null && set.rpe !== undefined && (
                    <span className="flex items-center gap-0.5 text-amber-400 shrink-0">
                      <Flame size={11} />
                      <span className="font-semibold">{set.rpe}</span>
                    </span>
                  )}

                  {/* RIR (only show if present) */}
                  {set.rir !== null && set.rir !== undefined && (
                    <span className="flex items-center gap-0.5 text-blue-400 shrink-0">
                      <Thermometer size={11} />
                      <span className="font-semibold">{set.rir}</span>
                    </span>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => removeSet(exIdx, setIdx)}
                    className="btn-ghost p-1 shrink-0"
                    aria-label="Remove set"
                  >
                    <Trash2 size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                  </button>
                </div>
              ))}
              {/* Set Notes (shown below the set row) */}
              {ex.sets.map((set: ParsedSet, setIdx: number) => (
                set.notes ? (
                  <div key={`note-${setIdx}`} className="ml-16 px-2 py-1 rounded bg-white/[0.03] text-[11px] text-zinc-400 italic">
                    Set {setIdx + 1}: &ldquo;{set.notes}&rdquo;
                  </div>
                ) : null
              ))}
            </div>

            <button
              onClick={() => addSet(exIdx)}
              className="btn-ghost w-full mt-2 text-xs"
            >
              <Plus size={14} /> Add Set
            </button>
          </div>
        ))
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pb-4">
        <button
          onClick={() => {
            setAnalyzeAfterSave(true);
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending || workout.exercises.length === 0}
          className="btn-primary w-full"
        >
          {saveMutation.isPending && analyzeAfterSave ? (
            <><Loader2 size={18} className="animate-spin" /> Saving...</>
          ) : (
            <><Brain size={18} /> Save & Analyze with Coach</>
          )}
        </button>

        <button
          onClick={() => {
            setAnalyzeAfterSave(false);
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending || workout.exercises.length === 0}
          className="btn-secondary w-full"
        >
          {saveMutation.isPending && !analyzeAfterSave ? (
            <><Loader2 size={18} className="animate-spin" /> Saving...</>
          ) : (
            <><Save size={18} /> Save Without Analysis</>
          )}
        </button>

        {saveMutation.isError && (
          <div className="p-3 rounded-lg" style={{ background: 'var(--color-error-muted)' }}>
            <p className="text-sm" style={{ color: 'var(--color-error)' }}>
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="page-content flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
      </div>
    }>
      <ReviewContent />
    </Suspense>
  );
}
