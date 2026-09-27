'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Dumbbell,
  Search,
  AlertTriangle,
  Edit3,
  Check,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { CANONICAL_MUSCLES, getMuscleDisplayName } from '@/lib/muscles/taxonomy';

interface ExerciseMuscleMap {
  id: string;
  muscleGroup: string;
  role: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  confidence: string;
  source: string;
}

interface ExerciseItem {
  id: string;
  canonicalName: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  muscleConfidence: string;
  category: string;
  _count: { workoutExercises: number };
  aliases: Array<{ alias: string }>;
  muscleMaps: ExerciseMuscleMap[];
}

type FilterTab = 'all' | 'unmapped' | 'mapped';

export default function ExercisesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [editingExercise, setEditingExercise] = useState<ExerciseItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['exercises', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/exercises${params}`);
      if (!res.ok) throw new Error('Failed to fetch exercises');
      return res.json();
    },
  });

  const exercises: ExerciseItem[] = data?.exercises ?? [];

  const isExerciseMapped = (ex: ExerciseItem) => {
    return (
      (ex.muscleMaps && ex.muscleMaps.length > 0) ||
      Boolean(ex.primaryMuscle)
    );
  };

  const filteredExercises = exercises.filter((ex) => {
    const mapped = isExerciseMapped(ex);
    if (activeFilter === 'unmapped') return !mapped;
    if (activeFilter === 'mapped') return mapped;
    return true;
  });

  const unmappedCount = exercises.filter((e) => !isExerciseMapped(e)).length;
  const mappedCount = exercises.filter((e) => isExerciseMapped(e)).length;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2 mb-1">
        <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Exercise Library</h1>
          <p className="text-xs text-zinc-400">Manage canonical exercises and anatomical muscle mappings</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="text"
          className="input pl-10 w-full text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises by name..."
        />
      </div>

      {/* Filter Tabs */}
      <div className="segment-control">
        <button
          className={`segment-item ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All ({exercises.length})
        </button>
        <button
          className={`segment-item ${activeFilter === 'unmapped' ? 'active' : ''}`}
          onClick={() => setActiveFilter('unmapped')}
        >
          Needs Mapping {unmappedCount > 0 && `(${unmappedCount})`}
        </button>
        <button
          className={`segment-item ${activeFilter === 'mapped' ? 'active' : ''}`}
          onClick={() => setActiveFilter('mapped')}
        >
          Mapped ({mappedCount})
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="card text-center py-8">
          <Dumbbell className="mx-auto mb-2 text-zinc-500" size={28} />
          <p className="font-semibold text-sm text-zinc-200">
            {search ? 'No exercises match your search' : 'No exercises found'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {search
              ? 'Try searching with a different keyword.'
              : activeFilter === 'unmapped'
              ? 'Great! All exercises currently have muscle mappings.'
              : 'Exercises are automatically registered when workouts are imported.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExercises.map((ex) => {
            const mapped = isExerciseMapped(ex);

            // Group muscles by role from muscleMaps or fallback to legacy fields
            const primaryList = ex.muscleMaps.length > 0
              ? ex.muscleMaps.filter((m) => m.role === 'PRIMARY')
              : ex.primaryMuscle
              ? [{ id: 'legacy-p', muscleGroup: ex.primaryMuscle, role: 'PRIMARY' as const, confidence: ex.muscleConfidence, source: 'system' }]
              : [];

            const secondaryList = ex.muscleMaps.length > 0
              ? ex.muscleMaps.filter((m) => m.role === 'SECONDARY')
              : ex.secondaryMuscles.map((sm, idx) => ({
                  id: `legacy-s-${idx}`,
                  muscleGroup: sm,
                  role: 'SECONDARY' as const,
                  confidence: ex.muscleConfidence,
                  source: 'system',
                }));

            const tertiaryList = ex.muscleMaps.filter((m) => m.role === 'TERTIARY');

            const source = ex.muscleMaps[0]?.source ?? (ex.muscleConfidence === 'VERIFIED' ? 'user' : 'system');

            return (
              <div
                key={ex.id}
                className={`card p-4 transition-colors ${
                  !mapped ? 'border-amber-500/30 bg-amber-500/[0.03]' : ''
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-base text-white">{ex.canonicalName}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                      <span>{ex._count.workoutExercises} workouts</span>
                      {ex.category && ex.category !== 'OTHER' && (
                        <>
                          <span>•</span>
                          <span className="uppercase text-[10px] tracking-wider text-zinc-500 font-medium">
                            {ex.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingExercise(ex)}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Edit3 size={13} />
                      <span>{mapped ? 'Edit' : 'Assign'}</span>
                    </button>
                    <button
                      onClick={() => router.push(`/exercise/${ex.id}`)}
                      className="p-1 text-zinc-500 hover:text-zinc-300"
                      aria-label="View history"
                      title="View history"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Aliases */}
                {ex.aliases.length > 0 && (
                  <p className="text-[11px] text-zinc-500 mb-2 truncate">
                    Aliases: {ex.aliases.map((a) => a.alias).join(', ')}
                  </p>
                )}

                {/* Mapped Muscles Breakdown or UNMAPPED WARNING */}
                {!mapped ? (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle size={15} />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Muscle Mapping Needed
                      </span>
                    </div>
                    <button
                      onClick={() => setEditingExercise(ex)}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
                    >
                      Assign Muscles →
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
                    {/* Primary */}
                    {primaryList.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400 min-w-[55px]">
                          Primary
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {primaryList.map((m) => (
                            <span
                              key={m.muscleGroup}
                              className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/25 text-xs text-red-300 font-medium"
                            >
                              {getMuscleDisplayName(m.muscleGroup)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Secondary */}
                    {secondaryList.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 min-w-[55px]">
                          Secondary
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {secondaryList.map((m) => (
                            <span
                              key={m.muscleGroup}
                              className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-xs text-amber-300"
                            >
                              {getMuscleDisplayName(m.muscleGroup)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tertiary */}
                    {tertiaryList.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 min-w-[55px]">
                          Tertiary
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {tertiaryList.map((m) => (
                            <span
                              key={m.muscleGroup}
                              className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-xs text-indigo-300"
                            >
                              {getMuscleDisplayName(m.muscleGroup)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Source / Confidence footer */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                      <span className="flex items-center gap-1">
                        <ShieldCheck size={11} className={source === 'user' ? 'text-emerald-400' : 'text-zinc-500'} />
                        <span>{source === 'user' ? 'Verified by You' : 'System Default'}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Mapping Modal */}
      {editingExercise && (
        <EditMappingModal
          exercise={editingExercise}
          onClose={() => setEditingExercise(null)}
          onSuccess={() => {
            setEditingExercise(null);
            queryClient.invalidateQueries({ queryKey: ['exercises'] });
            queryClient.invalidateQueries({ queryKey: ['progress'] });
            queryClient.invalidateQueries({ queryKey: ['workout'] });
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// EDIT MAPPING MODAL
// ============================================================================

function EditMappingModal({
  exercise,
  onClose,
  onSuccess,
}: {
  exercise: ExerciseItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Initial states derived from exercise
  const initialPrimary =
    exercise.muscleMaps.find((m) => m.role === 'PRIMARY')?.muscleGroup ??
    exercise.primaryMuscle ??
    '';

  const initialSecondary = new Set(
    exercise.muscleMaps.length > 0
      ? exercise.muscleMaps.filter((m) => m.role === 'SECONDARY').map((m) => m.muscleGroup)
      : exercise.secondaryMuscles
  );

  const initialTertiary = new Set(
    exercise.muscleMaps.filter((m) => m.role === 'TERTIARY').map((m) => m.muscleGroup)
  );

  const [primary, setPrimary] = useState<string>(initialPrimary);
  const [secondary, setSecondary] = useState<Set<string>>(initialSecondary);
  const [tertiary, setTertiary] = useState<Set<string>>(initialTertiary);

  const canonicalList = Object.values(CANONICAL_MUSCLES);

  const toggleSecondary = (id: string) => {
    const next = new Set(secondary);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Remove from tertiary if added to secondary
      const nextTert = new Set(tertiary);
      nextTert.delete(id);
      setTertiary(nextTert);
    }
    setSecondary(next);
  };

  const toggleTertiary = (id: string) => {
    const next = new Set(tertiary);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Remove from secondary if added to tertiary
      const nextSec = new Set(secondary);
      nextSec.delete(id);
      setSecondary(nextSec);
    }
    setTertiary(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const mappings: Array<{
        muscleGroup: string;
        role: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
        confidence: string;
      }> = [];

      if (primary) {
        mappings.push({
          muscleGroup: primary,
          role: 'PRIMARY',
          confidence: 'VERIFIED',
        });
      }

      for (const s of Array.from(secondary)) {
        if (s !== primary) {
          mappings.push({
            muscleGroup: s,
            role: 'SECONDARY',
            confidence: 'VERIFIED',
          });
        }
      }

      for (const t of Array.from(tertiary)) {
        if (t !== primary && !secondary.has(t)) {
          mappings.push({
            muscleGroup: t,
            role: 'TERTIARY',
            confidence: 'VERIFIED',
          });
        }
      }

      const res = await fetch('/api/exercises', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: exercise.id,
          mappings,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save mapping');
      }

      return res.json();
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-lg bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col z-10"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Edit Muscle Mapping
            </span>
            <h2 className="text-lg font-bold text-white leading-tight">
              {exercise.canonicalName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="overflow-y-auto p-4 space-y-5 flex-1">
          {mutation.isError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
            </div>
          )}

          {/* Primary Muscle Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-red-400 mb-1.5">
              Primary Muscle (Direct target)
            </label>
            <select
              value={primary}
              onChange={(e) => {
                const val = e.target.value;
                setPrimary(val);
                // Remove from secondary & tertiary if made primary
                if (val) {
                  const s = new Set(secondary);
                  s.delete(val);
                  setSecondary(s);
                  const t = new Set(tertiary);
                  t.delete(val);
                  setTertiary(t);
                }
              }}
              className="input w-full text-sm"
            >
              <option value="">— None / Unmapped —</option>
              {canonicalList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.category})
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Muscles */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1.5">
              Secondary Muscles (Synergists)
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">
              Muscles that assist significantly (e.g. Triceps on Bench Press)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {canonicalList.map((m) => {
                if (m.id === primary) return null;
                const isSelected = secondary.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleSecondary(m.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {isSelected && <Check size={12} className="inline mr-1" />}
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tertiary Muscles */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1.5">
              Tertiary Muscles (Stabilizers / minor)
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">
              Muscles providing stability or minor assistance
            </p>
            <div className="flex flex-wrap gap-1.5">
              {canonicalList.map((m) => {
                if (m.id === primary || secondary.has(m.id)) return null;
                const isSelected = tertiary.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleTertiary(m.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {isSelected && <Check size={12} className="inline mr-1" />}
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2 bg-[#141418]">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="btn-ghost text-xs py-2 px-4"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary text-xs py-2 px-5 flex items-center gap-1.5"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Mappings</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
