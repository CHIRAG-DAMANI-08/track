'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, TrendingUp, Dumbbell, Trophy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

export default function ExerciseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const exerciseId = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ['exercise-detail', exerciseId],
    queryFn: async () => {
      const res = await fetch(`/api/progress?metric=exercise&exerciseId=${exerciseId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const { data: recordsData } = useQuery({
    queryKey: ['exercise-records', exerciseId],
    queryFn: async () => {
      const res = await fetch(`/api/progress?metric=records&exerciseId=${exerciseId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="page-content flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
      </div>
    );
  }

  const history = data?.history;
  const records = recordsData?.records ?? [];

  if (!history) {
    return (
      <div className="page-content">
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Exercise</h1>
        </div>
        <div className="empty-state">
          <Dumbbell className="empty-state-icon" />
          <p className="empty-state-title">Exercise not found</p>
        </div>
      </div>
    );
  }

  const chartData = history.entries
    .filter((e: { estimated1RM: number | null }) => e.estimated1RM)
    .map((e: { date: string; estimated1RM: number; bestSet: { weightKg: number; reps: number } | null; totalVolume: number }) => ({
      date: format(new Date(e.date), 'MMM d'),
      e1rm: Math.round(e.estimated1RM),
      weight: e.bestSet?.weightKg,
      volume: Math.round(e.totalVolume),
    }))
    .reverse();

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">{history.canonicalName}</h1>
      </div>

      {/* Records */}
      {records.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-medium">Personal Records</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {records.map((r: { type: string; value: number; date: string }, i: number) => (
              <div key={i} className="p-2 rounded-lg" style={{ background: 'var(--color-surface-2)' }}>
                <p className="text-lg font-bold">{r.value}{r.type === 'weight' || r.type === 'estimated_1rm' ? ' kg' : ''}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {r.type === 'weight' ? 'Max Weight' :
                   r.type === 'reps' ? 'Max Reps' :
                   r.type === 'volume' ? 'Max Set Volume' :
                   'Est. 1RM'} · {format(new Date(r.date), 'MMM d')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* E1RM Chart */}
      {chartData.length >= 2 ? (
        <div className="card">
          <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Estimated 1RM Trend
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#68687a' }} />
              <YAxis tick={{ fontSize: 10, fill: '#68687a' }} width={40} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  background: '#1c1c22',
                  border: '1px solid #ffffff14',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
              />
              <Line type="monotone" dataKey="e1rm" stroke="#e8a034" strokeWidth={2} dot={{ r: 3, fill: '#e8a034' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
            Need at least 2 sessions with qualifying sets to show a trend chart
          </p>
        </div>
      )}

      {/* History List */}
      <div className="card">
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          Session History
        </h3>
        {history.entries.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-tertiary)' }}>
            No sessions recorded yet
          </p>
        ) : (
          <div className="space-y-3">
            {history.entries.map((entry: {
              date: string;
              workoutId: string;
              bestSet: { weightKg: number; reps: number } | null;
              totalVolume: number;
              estimated1RM: number | null;
              sets: Array<{ weightKg: number | null; reps: number | null; volume: number }>;
            }, i: number) => (
              <button
                key={i}
                onClick={() => router.push(`/workout/${entry.workoutId}`)}
                className="w-full text-left p-3 rounded-lg"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{format(new Date(entry.date), 'MMM d, yyyy')}</span>
                  {entry.estimated1RM && (
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      e1RM: {Math.round(entry.estimated1RM)} kg
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{entry.sets.length} sets</span>
                  {entry.bestSet && (
                    <span>Best: {entry.bestSet.weightKg}kg × {entry.bestSet.reps}</span>
                  )}
                  <span>Vol: {Math.round(entry.totalVolume)} kg</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
