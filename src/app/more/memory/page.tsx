'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Brain, Loader2, Check, X, AlertTriangle, Eye, Sparkles } from 'lucide-react';
import { useState } from 'react';

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  CANDIDATE: 'Candidate',
  DISPUTED: 'Disputed',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
};

const STATUS_BADGES: Record<string, string> = {
  CONFIRMED: 'badge-success',
  ACTIVE: 'badge-accent',
  CANDIDATE: 'badge-info',
  DISPUTED: 'badge-warning',
  SUPERSEDED: 'badge-error',
  ARCHIVED: 'badge-error',
};

const TYPE_LABELS: Record<string, string> = {
  PROFILE: 'Profile',
  PREFERENCE: 'Preference',
  CONSTRAINT: 'Constraint',
  OBSERVATION: 'Observation',
  HYPOTHESIS: 'Hypothesis',
  INTERVENTION: 'Intervention',
  OUTCOME: 'Outcome',
  LEARNED_PATTERN: 'Pattern',
};

type MemoryCategory = 'all' | 'preferences' | 'patterns' | 'hypotheses' | 'outcomes';

export default function MemoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['memories'],
    queryFn: async () => {
      const res = await fetch('/api/memory');
      if (!res.ok) throw new Error('Failed to fetch memories');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch('/api/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('Failed to update memory');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const allMemories = data?.memories ?? [];

  const filteredMemories = allMemories.filter((m: { memoryType: string }) => {
    if (selectedCategory === 'preferences') {
      return ['PREFERENCE', 'PROFILE', 'CONSTRAINT'].includes(m.memoryType);
    }
    if (selectedCategory === 'patterns') {
      return ['LEARNED_PATTERN', 'OBSERVATION'].includes(m.memoryType);
    }
    if (selectedCategory === 'hypotheses') {
      return m.memoryType === 'HYPOTHESIS';
    }
    if (selectedCategory === 'outcomes') {
      return ['INTERVENTION', 'OUTCOME'].includes(m.memoryType);
    }
    return true;
  });

  return (
    <div className="page-content pb-20">
      {/* Header */}
      <div className="pt-2 mb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">What I&apos;ve learned about you</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              This is what I&apos;ve learned from your training history and the things you&apos;ve told me.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="segment-control text-xs">
        <button
          className={`segment-item ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          All ({allMemories.length})
        </button>
        <button
          className={`segment-item ${selectedCategory === 'preferences' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('preferences')}
        >
          Preferences
        </button>
        <button
          className={`segment-item ${selectedCategory === 'patterns' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('patterns')}
        >
          Patterns
        </button>
        <button
          className={`segment-item ${selectedCategory === 'hypotheses' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('hypotheses')}
        >
          Hypotheses
        </button>
        <button
          className={`segment-item ${selectedCategory === 'outcomes' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('outcomes')}
        >
          Outcomes
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-zinc-500" />
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="card text-center py-10">
          <Brain className="mx-auto mb-2 text-zinc-500 opacity-60" size={32} />
          <p className="font-semibold text-sm text-zinc-200">Nothing here yet, Chirag.</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
            As you log workouts and we test adjustments, I will record verified observations, patterns, and insights here with evidence links.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((m: {
            id: string;
            memoryType: string;
            statement: string;
            confidence: number;
            evidenceCount: number;
            status: string;
            evidence: Array<{ id: string; description: string; supports: boolean; sourceType: string }>;
          }) => (
            <div key={m.id} className="card p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${STATUS_BADGES[m.status] ?? 'badge-info'} text-[11px]`}>
                    {STATUS_LABELS[m.status] ?? m.status}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    {TYPE_LABELS[m.memoryType] ?? m.memoryType}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500">
                  {Math.round(m.confidence * 100)}% confidence · {m.evidenceCount} evidence
                </span>
              </div>

              <p className="text-sm text-zinc-200 leading-relaxed font-normal">{m.statement}</p>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                {m.status === 'CANDIDATE' && (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, action: 'activate' })}
                      className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-emerald-400 flex items-center gap-1"
                    >
                      <Check size={13} /> Accept
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, action: 'dismiss' })}
                      className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-400 flex items-center gap-1"
                    >
                      <X size={13} /> Dismiss
                    </button>
                  </>
                )}
                {m.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, action: 'confirm' })}
                      className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-emerald-400 flex items-center gap-1"
                    >
                      <Check size={13} /> Confirm
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, action: 'dispute' })}
                      className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-amber-400 flex items-center gap-1"
                    >
                      <AlertTriangle size={13} /> Dispute
                    </button>
                  </>
                )}
                <button
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 ml-auto flex items-center gap-1"
                >
                  <Eye size={13} />
                  <span>{expandedId === m.id ? 'Hide Evidence' : 'View Evidence'}</span>
                </button>
              </div>

              {/* Evidence details */}
              {expandedId === m.id && m.evidence.length > 0 && (
                <div className="mt-2 pt-2 space-y-1.5 border-t border-white/5">
                  {m.evidence.map((e) => (
                    <div key={e.id} className="text-xs p-2 rounded-lg bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={e.supports ? 'badge badge-success text-[10px]' : 'badge badge-warning text-[10px]'}>
                          {e.supports ? 'supports' : 'contradicts'}
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase">{e.sourceType}</span>
                      </div>
                      <p className="text-zinc-300">{e.description}</p>
                    </div>
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
