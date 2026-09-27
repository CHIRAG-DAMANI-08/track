'use client';

import React from 'react';
import { X, Dumbbell, Calendar, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import type { MuscleExposureDetail } from './muscle-map.types';

interface MuscleMapSheetProps {
  muscle: MuscleExposureDetail | null;
  onClose: () => void;
  onViewExercise?: (exerciseId: string) => void;
}

export function MuscleMapSheet({
  muscle,
  onClose,
  onViewExercise,
}: MuscleMapSheetProps) {
  if (!muscle) return null;

  const levelColor =
    muscle.exposureLevel === 'High'
      ? '#ef4444'
      : muscle.exposureLevel === 'Moderate'
      ? '#eab308'
      : '#6366f1';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-lg bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col z-10"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: levelColor }}
              />
              <span
                className="text-xs uppercase tracking-wider font-semibold"
                style={{ color: levelColor }}
              >
                {muscle.exposureLevel} Training Exposure
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-zinc-400">
                {muscle.category}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {muscle.displayName}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 -mr-2 text-zinc-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body content scrollable */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Dumbbell size={14} />
                <span>Working Sets</span>
              </div>
              <p className="text-xl font-bold text-white">
                {muscle.workingSets}{' '}
                <span className="text-xs font-normal text-zinc-400">sets</span>
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Calendar size={14} />
                <span>Sessions</span>
              </div>
              <p className="text-xl font-bold text-white">
                {muscle.workoutCount}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  {muscle.workoutCount === 1 ? 'workout' : 'workouts'}
                </span>
              </p>
            </div>
          </div>

          {/* Trend Banner */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2.5">
            <TrendingUp size={16} className="text-zinc-400 shrink-0" />
            <div className="text-xs">
              <span className="text-zinc-400">Trend: </span>
              <span className="font-medium text-zinc-200">
                {muscle.trendText ?? 'Not enough history to determine a trend.'}
              </span>
            </div>
          </div>

          {/* Contributing Exercises */}
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-zinc-400 mb-3">
              Contributing Exercises
            </h3>

            {muscle.contributors.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.02] text-center text-sm text-zinc-500">
                No individual exercises recorded for this muscle.
              </div>
            ) : (
              <div className="space-y-2">
                {muscle.contributors.map((contrib, idx) => (
                  <div
                    key={`${contrib.exerciseId}-${contrib.emphasis}-${idx}`}
                    onClick={() => onViewExercise?.(contrib.exerciseId)}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between hover:bg-white/[0.06] transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors">
                          {contrib.exerciseName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            contrib.emphasis === 'PRIMARY'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : contrib.emphasis === 'SECONDARY'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/30'
                          }`}
                        >
                          {contrib.emphasis}
                        </span>
                        {contrib.workoutNames && contrib.workoutNames.length > 0 && (
                          <span className="text-xs text-zinc-500 truncate max-w-[180px]">
                            {contrib.workoutNames.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white whitespace-nowrap">
                        {contrib.workingSets}{' '}
                        <span className="text-xs font-normal text-zinc-400">sets</span>
                      </span>
                      {onViewExercise && (
                        <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-300" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-black/20">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-medium text-sm bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
