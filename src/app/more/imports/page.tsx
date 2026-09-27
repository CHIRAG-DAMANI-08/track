'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export default function ImportsPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: async () => {
      const res = await fetch('/api/import');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const imports = data?.imports ?? [];

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Raw Imports</h1>
      </div>

      <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Original Hevy workout text is preserved for every import so parser improvements
        can reprocess historical data.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      ) : imports.length === 0 ? (
        <div className="empty-state">
          <FileText className="empty-state-icon" />
          <p className="empty-state-title">No imports yet</p>
          <p className="empty-state-description">
            Import your first workout by tapping the + button in the navigation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {imports.map((imp: {
            id: string;
            rawText: string;
            parseStatus: string;
            createdAt: string;
            workouts: Array<{ id: string; name: string | null; performedAt: string }>;
          }) => (
            <div key={imp.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <span className={`badge ${
                  imp.parseStatus === 'SUCCESS' ? 'badge-success' :
                  imp.parseStatus === 'PARTIAL' ? 'badge-warning' :
                  imp.parseStatus === 'FAILED' ? 'badge-error' : 'badge-info'
                }`}>
                  {imp.parseStatus}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {format(new Date(imp.createdAt), 'MMM d, HH:mm')}
                </span>
              </div>

              <p className="text-sm font-mono truncate mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {imp.rawText.slice(0, 100)}{imp.rawText.length > 100 ? '...' : ''}
              </p>

              {imp.workouts.length > 0 && (
                <div className="space-y-1">
                  {imp.workouts.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => router.push(`/workout/${w.id}`)}
                      className="flex items-center justify-between w-full p-2 rounded-lg text-left"
                      style={{ background: 'var(--color-surface-2)' }}
                    >
                      <span className="text-xs">{w.name ?? 'Unnamed workout'}</span>
                      <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
