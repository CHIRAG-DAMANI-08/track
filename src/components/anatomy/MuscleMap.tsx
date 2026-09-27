'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BodyChart, ViewSide, INTENSITY_COLORS } from 'body-muscles';
import { SVG_ID_TO_CANONICAL, CANONICAL_MUSCLES, getMuscleDisplayName } from '@/lib/muscles/taxonomy';
import { MuscleLegend } from './MuscleLegend';

// Customize body-muscles palette once in memory for dark UI consistency
if (typeof window !== 'undefined') {
  INTENSITY_COLORS[0] = '#24242d'; // Dark graphite for inactive muscles
  INTENSITY_COLORS[1] = '#3730a3'; // Deep Indigo (low)
  INTENSITY_COLORS[2] = '#4338ca';
  INTENSITY_COLORS[3] = '#4f46e5';
  INTENSITY_COLORS[4] = '#6366f1'; // Electric Indigo (accent)
  INTENSITY_COLORS[5] = '#818cf8';
  INTENSITY_COLORS[6] = '#eab308'; // Amber (moderate)
  INTENSITY_COLORS[7] = '#f59e0b';
  INTENSITY_COLORS[8] = '#ea580c'; // Warm Coral
  INTENSITY_COLORS[9] = '#ef4444'; // Red (high)
  INTENSITY_COLORS[10] = '#dc2626'; // Vivid Red (peak)
}

export interface MuscleMapProps {
  bodyState?: Record<string, { intensity: number; selected: boolean }>;
  selectedMuscleId?: string | null;
  onSelectMuscle?: (muscleId: string, displayName: string) => void;
  initialView?: 'FRONT' | 'BACK';
  compact?: boolean;
  showControls?: boolean;
  showLegend?: boolean;
  className?: string;
  hasData?: boolean;
  viewportHeight?: string;
}

export function MuscleMap({
  bodyState = {},
  selectedMuscleId = null,
  onSelectMuscle,
  initialView = 'FRONT',
  compact = false,
  showControls = true,
  showLegend = true,
  className = '',
  hasData = true,
  viewportHeight,
}: MuscleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<BodyChart | null>(null);
  const [view, setView] = useState<'FRONT' | 'BACK'>(initialView);

  // Keep a stable ref to callback to prevent chart re-creation
  const onSelectMuscleRef = useRef(onSelectMuscle);
  useEffect(() => {
    onSelectMuscleRef.current = onSelectMuscle;
  }, [onSelectMuscle]);

  // Build the effective body state applying selection
  const getEffectiveBodyState = () => {
    const effective = { ...bodyState };

    if (selectedMuscleId) {
      const def = CANONICAL_MUSCLES[selectedMuscleId];
      const targetSvgIds = def ? def.bodyMuscleIds : [selectedMuscleId];

      for (const svgId of targetSvgIds) {
        effective[svgId] = {
          intensity: effective[svgId]?.intensity ?? 0,
          selected: true,
        };
      }
    }

    return effective;
  };

  // Initialize BodyChart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = new BodyChart(containerRef.current, {
      view: view === 'FRONT' ? ViewSide.FRONT : ViewSide.BACK,
      bodyState: getEffectiveBodyState(),
      enableTransitions: true,
      ariaLabel: `Human anatomy muscle map, ${view.toLowerCase()} view`,
      onMuscleClick: (svgId: string) => {
        const canonicalId = SVG_ID_TO_CANONICAL[svgId] || svgId;
        const displayName = getMuscleDisplayName(canonicalId);
        onSelectMuscleRef.current?.(canonicalId, displayName);
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync view state when initialView prop changes
  const [prevInitialView, setPrevInitialView] = useState(initialView);
  if (prevInitialView !== initialView) {
    setPrevInitialView(initialView);
    setView(initialView);
  }

  // Update chart view when view state changes
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.update({
      view: view === 'FRONT' ? ViewSide.FRONT : ViewSide.BACK,
      bodyState: getEffectiveBodyState(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Update bodyState and selection when props change
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.update({
      bodyState: getEffectiveBodyState(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyState, selectedMuscleId]);

  return (
    <div className={`flex flex-col items-center w-full select-none ${className}`}>
      {/* Front / Back Segmented Control - positioned cleanly above anatomy */}
      {showControls && (
        <div className="flex justify-center w-full mb-2.5 z-10 relative">
          <div className="inline-flex rounded-lg p-0.5 bg-black/40 border border-white/10 shadow-inner">
            <button
              type="button"
              onClick={() => setView('FRONT')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold tracking-wider uppercase transition-all ${
                view === 'FRONT'
                  ? 'bg-zinc-700/90 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Front
            </button>
            <button
              type="button"
              onClick={() => setView('BACK')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold tracking-wider uppercase transition-all ${
                view === 'BACK'
                  ? 'bg-zinc-700/90 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Contained Anatomy Viewport - strictly prevents overflow */}
      <div
        ref={containerRef}
        className="muscle-map-viewport w-full"
        style={{
          height: viewportHeight ?? (compact ? 'clamp(180px, 24vh, 220px)' : 'clamp(280px, 36vh, 360px)'),
        }}
      />

      {/* Muscle Heat Legend */}
      {showLegend && !compact && (
        <div className="mt-3 w-full flex justify-center">
          <MuscleLegend hasData={hasData} />
        </div>
      )}
    </div>
  );
}
