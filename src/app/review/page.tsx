'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Brain, Loader2, Trash2, Plus,
  AlertTriangle
} from 'lucide-react';
import type { ParsedWorkout, ParsedExercise } from '@/lib/schemas';

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
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });

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
                  reps: null,
                  durationSeconds: null,
                  distanceMeters: null,
                  rpe: null,
                  isPersonalRecord: false,
                  notes: null,
                },
              ],
            }
          : ex
      ),
    }));
  }, []);

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
          className="input"
          value={workout.durationMinutes ?? ''}
          onChange={(e) => updateWorkoutField('durationMinutes', e.target.value ? parseInt(e.target.value) : null)}
          placeholder="Optional"
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
            <div className="flex items-center justify-between mb-3">
              <input
                type="text"
                className="input flex-1 mr-2"
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

            {/* Sets Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-tertiary)' }}>
                    <th className="text-left pb-2 pr-2 font-medium text-xs">Set</th>
                    <th className="text-left pb-2 pr-2 font-medium text-xs">Weight (kg)</th>
                    <th className="text-left pb-2 pr-2 font-medium text-xs">Reps</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((set, setIdx) => (
                    <tr key={setIdx}>
                      <td className="py-1 pr-2">
                        <span className="badge badge-accent text-xs">{setIdx + 1}</span>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input py-1.5 px-2 text-sm"
                          style={{ minHeight: '36px' }}
                          value={set.weightKg ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weightKg', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="—"
                          step="0.5"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input py-1.5 px-2 text-sm"
                          style={{ minHeight: '36px' }}
                          value={set.reps ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="—"
                        />
                      </td>
                      <td className="py-1">
                        <button
                          onClick={() => removeSet(exIdx, setIdx)}
                          className="btn-ghost p-1"
                          aria-label="Remove set"
                        >
                          <Trash2 size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
