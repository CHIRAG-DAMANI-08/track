'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Plus,
  ChevronRight,
  Target,
  Award,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { ImportSheet } from '@/components/import-sheet';
import { MuscleMap } from '@/components/anatomy';
import type { DashboardResponse } from '@/app/api/dashboard/route';

export default function TodayPage() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [muscleView, setMuscleView] = useState<'FRONT' | 'BACK'>('FRONT');

  const { data, isLoading } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      return res.json();
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  if (isLoading || !data) {
    return (
      <div className="w-full h-[calc(100dvh-80px-env(safe-area-inset-bottom))] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg md:max-w-4xl mx-auto flex flex-col justify-between h-[calc(100dvh-80px-env(safe-area-inset-bottom))] max-h-[calc(100dvh-80px-env(safe-area-inset-bottom))] px-3 py-2 sm:px-4 sm:py-3 overflow-hidden md:h-auto md:max-h-none md:overflow-visible">
      {/* 1. Compact Header (<= 60px) */}
      <header className="flex items-center justify-between pb-1.5 shrink-0">
        <div>
          <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight">
            {data.athlete.greeting}
          </h1>
          <p className="text-[10px] sm:text-xs text-zinc-400 font-medium">
            {data.athlete.subtext}
          </p>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-amber-400 border border-white/5 transition-colors"
          aria-label="Import workout"
        >
          <Plus size={16} />
        </button>
      </header>

      {/* 2. Responsive Command Center Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 flex-1 min-h-0 items-stretch">
        {/* CARD 1 — TRAINING (Workouts this week + day dots) */}
        <div
          className="card p-2 sm:p-2.5 flex flex-col justify-between cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => router.push('/progress')}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              Training
            </span>
            <Calendar size={12} className="text-zinc-500" />
          </div>

          <div className="my-auto py-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white leading-none">
                {data.training.workoutsThisWeek}
              </span>
              <span className="text-[10px] font-semibold text-zinc-400">
                workouts
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-medium block">
              This week
            </span>
          </div>

          {/* M T W T F S S Day tracker dots */}
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            {data.training.weekDays.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`text-[8px] font-bold ${d.isToday ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {d.day}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    d.active
                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                      : d.isToday
                      ? 'bg-amber-400/40 ring-1 ring-amber-400'
                      : 'bg-white/10'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CARD 2 — RECORDS / PRs (with dynamic fallback if 0 PRs) */}
        <div
          className="card p-2 sm:p-2.5 flex flex-col justify-between cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => router.push('/progress')}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              {data.records.label}
            </span>
            {data.records.type === 'prs' ? (
              <Award size={13} className="text-amber-400" />
            ) : (
              <Dumbbell size={13} className="text-zinc-500" />
            )}
          </div>

          <div className="my-auto py-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white leading-none">
                {data.records.value}
              </span>
              <span className="text-[10px] font-semibold text-zinc-400">
                {data.records.sublabel}
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-medium block">
              {data.records.type === 'prs' ? 'Personal Records' : `${data.training.volumeThisWeek.toLocaleString()} kg volume`}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-zinc-400 font-medium">
            <span>View trends</span>
            <ChevronRight size={11} className="text-zinc-500" />
          </div>
        </div>

        {/* CARD 3 — MUSCLE COVERAGE (Span 2 columns, mini anatomy + top bars) */}
        <div className="card col-span-2 md:col-span-2 p-2 sm:p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Target size={12} className="text-indigo-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                Muscle Coverage
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Segmented Front / Back toggle */}
              <div className="inline-flex rounded p-0.5 bg-black/40 border border-white/10">
                <button
                  type="button"
                  onClick={() => setMuscleView('FRONT')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${
                    muscleView === 'FRONT'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => setMuscleView('BACK')}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${
                    muscleView === 'BACK'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Back
                </button>
              </div>

              <button
                onClick={() => router.push('/progress')}
                className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center"
              >
                <span>Full</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>

          {data.muscleCoverage.hasData ? (
            <div className="grid grid-cols-12 gap-2 items-center my-auto">
              {/* Left: Mini Anatomy Viewport */}
              <div className="col-span-5 flex items-center justify-center">
                <div className="w-full flex items-center justify-center">
                  <MuscleMap
                    bodyState={data.muscleCoverage.bodyState}
                    initialView={muscleView}
                    compact={true}
                    showControls={false}
                    showLegend={false}
                    viewportHeight="108px"
                  />
                </div>
              </div>

              {/* Right: Top 3 Muscle Bars */}
              <div className="col-span-7 space-y-1.5 pl-0.5">
                {data.muscleCoverage.topMuscles.map((m, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-zinc-200 truncate">{m.displayName}</span>
                      <span className="text-[9px] font-bold text-indigo-300">{m.sets}s</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-[11px] text-zinc-400 mb-1">Import your first workout</p>
              <button
                onClick={() => setImportOpen(true)}
                className="text-[10px] text-indigo-400 font-semibold underline"
              >
                + Import Hevy
              </button>
            </div>
          )}
        </div>

        {/* CARD 4 — STRENGTH MOVERS (Col 1, 3 trends from history) */}
        <div
          className="card p-2 sm:p-2.5 flex flex-col justify-between cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => router.push('/progress')}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              Strength
            </span>
            <TrendingUp size={12} className="text-emerald-400" />
          </div>

          {data.strengthMovers.length > 0 ? (
            <div className="space-y-1 my-auto">
              {data.strengthMovers.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-300 truncate font-medium max-w-[80px]">
                    {item.exerciseName}
                  </span>
                  <span
                    className={`font-bold flex items-center gap-0.5 text-[9px] ${
                      item.trend === 'up'
                        ? 'text-emerald-400'
                        : item.trend === 'down'
                        ? 'text-amber-400'
                        : 'text-zinc-400'
                    }`}
                  >
                    {item.trend === 'up' && <TrendingUp size={9} />}
                    {item.trend === 'down' && <TrendingDown size={9} />}
                    {item.trend === 'stable' && <Minus size={9} />}
                    {item.changeText}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="my-auto py-1">
              <p className="text-[10px] text-zinc-500 font-medium">
                Not enough history yet.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-zinc-400 font-medium">
            <span>All exercises</span>
            <ChevronRight size={11} className="text-zinc-500" />
          </div>
        </div>

        {/* CARD 5 — COACH SNAPSHOT (Col 2, single current insight) */}
        <div
          className="card p-2 sm:p-2.5 flex flex-col justify-between cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => router.push(data.coachSnapshot.ctaHref)}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Brain size={12} className="text-indigo-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Coach
              </span>
            </div>
            <Sparkles size={11} className="text-amber-400" />
          </div>

          <div className="my-auto py-0.5">
            <p className="text-[10px] text-zinc-300 leading-snug line-clamp-3 font-normal">
              &ldquo;{data.coachSnapshot.insight}&rdquo;
            </p>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] font-semibold text-amber-400">
            <span>{data.coachSnapshot.ctaText}</span>
            <ChevronRight size={11} />
          </div>
        </div>

        {/* CARD 6 — LAST WORKOUT / IMPORT (Span 2 columns, full width compact) */}
        <div className="card col-span-2 md:col-span-4 p-2 sm:p-2.5 flex items-center justify-between gap-2">
          {data.latestWorkout ? (
            <>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => router.push(`/workout/${data.latestWorkout!.id}`)}
              >
                <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Last Workout
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                  {data.latestWorkout.name}
                </h4>
                <span className="text-[9px] text-zinc-400">
                  {data.latestWorkout.formattedDate} · {data.latestWorkout.setsCount} sets
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => router.push(`/workout/${data.latestWorkout!.id}`)}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-zinc-200 transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="btn-primary text-[11px] py-1 px-2.5 min-h-[30px] font-semibold shadow-sm flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>Import Hevy</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Import Your First Workout</span>
                <span className="text-[9px] text-zinc-400">Paste a Hevy workout to start tracking</span>
              </div>
              <button
                onClick={() => setImportOpen(true)}
                className="btn-primary text-xs py-1.5 px-3 min-h-[32px]"
              >
                <Plus size={13} />
                <span>Import Hevy</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
