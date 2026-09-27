'use client';

import React from 'react';

interface MuscleLegendProps {
  className?: string;
  hasData?: boolean;
}

export function MuscleLegend({ className = '', hasData = true }: MuscleLegendProps) {
  return (
    <div
      className={`flex items-center justify-center gap-4 text-xs py-2 px-3 rounded-full border border-white/5 ${className}`}
      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#24242d', border: '1px solid #ffffff15' }} />
        <span style={{ color: 'var(--color-text-tertiary)' }}>Inactive</span>
      </div>
      {hasData && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#4f46e5' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>Low</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#eab308' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>Moderate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>High</span>
          </div>
        </>
      )}
    </div>
  );
}
