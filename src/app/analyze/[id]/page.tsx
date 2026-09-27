'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Brain, Loader2, Check, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';
import { useEffect } from 'react';

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params.id as string;

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', workoutId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Analysis failed');
      }
      return res.json();
    },
  });

  // Auto-trigger analysis
  useEffect(() => {
    if (!analyzeMutation.data && !analyzeMutation.isPending && !analyzeMutation.isError) {
      analyzeMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = analyzeMutation.data?.analysis;

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => router.push(`/workout/${workoutId}`)} className="btn-ghost p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Your Analysis</h1>
      </div>

      {analyzeMutation.isPending && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Analyzing your workout...</p>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Reviewing your performance against your history
          </p>
        </div>
      )}

      {analyzeMutation.isError && (
        <div className="card" style={{ borderColor: 'var(--color-error)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} style={{ color: 'var(--color-error)' }} />
            <span className="font-medium" style={{ color: 'var(--color-error)' }}>Analysis Failed</span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            {analyzeMutation.error instanceof Error ? analyzeMutation.error.message : 'Could not analyze workout'}
          </p>
          <div className="flex gap-2">
            <button onClick={() => analyzeMutation.mutate()} className="btn-secondary flex-1">
              Retry
            </button>
            <button onClick={() => router.push(`/workout/${workoutId}`)} className="btn-ghost flex-1">
              View Workout
            </button>
          </div>
        </div>
      )}

      {analysis && (
        <>
          {/* Summary */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Summary</span>
            </div>
            <p className="text-sm leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Going Well */}
          {analysis.goingWell.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Check size={16} style={{ color: 'var(--color-success)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>Going Well</span>
              </div>
              <ul className="space-y-2">
                {analysis.goingWell.map((item: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-success)' }}>·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Needs Attention */}
          {analysis.needsAttention.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>Needs Attention</span>
              </div>
              <ul className="space-y-2">
                {analysis.needsAttention.map((item: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-warning)' }}>·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} style={{ color: 'var(--color-accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>Recommendations</span>
              </div>
              <div className="space-y-3">
                {analysis.recommendations.map((rec: { title: string; content: string; reasoning: string }, i: number) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--color-surface-2)' }}>
                    <p className="font-medium text-sm mb-1">{rec.title}</p>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{rec.content}</p>
                    {rec.reasoning && (
                      <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                        Why: {rec.reasoning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hypotheses */}
          {analysis.hypotheses?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} style={{ color: 'var(--color-info)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-info)' }}>Hypotheses</span>
              </div>
              <div className="space-y-3">
                {analysis.hypotheses.map((hyp: { statement: string; reasoning: string; confidence: number }, i: number) => (
                  <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--color-surface-2)' }}>
                    <p className="text-sm mb-1">{hyp.statement}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {hyp.reasoning} · Confidence: {Math.round(hyp.confidence * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigate to workout */}
          <button
            onClick={() => router.push(`/workout/${workoutId}`)}
            className="btn-secondary w-full"
          >
            View Workout Details
          </button>
        </>
      )}
    </div>
  );
}
