'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FlaskConical, Loader2, Plus, Check, Pause, X } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';

export default function ExperimentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['experiments'],
    queryFn: async () => {
      const res = await fetch('/api/experiments');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const experiments = data?.experiments ?? [];
  const active = experiments.filter((e: { status: string }) => e.status === 'ACTIVE');
  const completed = experiments.filter((e: { status: string }) => e.status === 'COMPLETED');
  const other = experiments.filter((e: { status: string }) => !['ACTIVE', 'COMPLETED'].includes(e.status));

  return (
    <div className="page-content">
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Experiments</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-ghost">
          <Plus size={18} /> New
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
      ) : experiments.length === 0 ? (
        <div className="empty-state">
          <FlaskConical className="empty-state-icon" />
          <p className="empty-state-title">No experiments yet</p>
          <p className="empty-state-description">
            Experiments arise from coaching recommendations. As you accumulate workout history,
            the coach may suggest trying specific training changes and tracking the results.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-secondary mt-4">
            <Plus size={16} /> Create Experiment
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <Section title="Active" experiments={active} queryClient={queryClient} />
          )}
          {completed.length > 0 && (
            <Section title="Completed" experiments={completed} queryClient={queryClient} />
          )}
          {other.length > 0 && (
            <Section title="Other" experiments={other} queryClient={queryClient} />
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && <CreateExperimentModal onClose={() => setShowCreate(false)} queryClient={queryClient} />}
    </div>
  );
}

function Section({ title, experiments, queryClient }: {
  title: string;
  experiments: Array<{
    id: string; title: string; intervention: string; status: string;
    startDate: string; targetEndDate: string | null;
    outcome: { conclusion: string; confidence: number; causalClaim: string } | null;
  }>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', id, status }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] });
    },
  });

  return (
    <div>
      <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        {title}
      </h2>
      <div className="space-y-3">
        {experiments.map((exp) => (
          <div key={exp.id} className="card">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-sm flex-1">{exp.title}</h3>
              <span className={`badge ${
                exp.status === 'ACTIVE' ? 'badge-success' :
                exp.status === 'COMPLETED' ? 'badge-accent' : 'badge-info'
              }`}>
                {exp.status}
              </span>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              {exp.intervention}
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              Started: {format(new Date(exp.startDate), 'MMM d, yyyy')}
              {exp.targetEndDate && ` · Target: ${format(new Date(exp.targetEndDate), 'MMM d, yyyy')}`}
            </p>

            {exp.outcome && (
              <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--color-surface-2)' }}>
                <p className="text-sm font-medium mb-1">Conclusion</p>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {exp.outcome.conclusion}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Confidence: {Math.round(exp.outcome.confidence * 100)}% · Causal claim: {exp.outcome.causalClaim.replace('_', ' ')}
                </p>
              </div>
            )}

            {exp.status === 'ACTIVE' && (
              <div className="flex gap-2">
                <button
                  onClick={() => statusMutation.mutate({ id: exp.id, status: 'PAUSED' })}
                  className="btn-ghost text-xs"
                >
                  <Pause size={14} /> Pause
                </button>
                <button
                  onClick={() => statusMutation.mutate({ id: exp.id, status: 'ABANDONED' })}
                  className="btn-ghost text-xs"
                >
                  <X size={14} /> Abandon
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateExperimentModal({ onClose, queryClient }: {
  onClose: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [title, setTitle] = useState('');
  const [intervention, setIntervention] = useState('');
  const [baseline, setBaseline] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title,
          intervention,
          baselineDescription: baseline || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] });
      onClose();
    },
  });

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-content">
        <div className="sheet-handle" />
        <div className="px-4 pb-4">
          <h2 className="text-lg font-semibold mb-4">New Experiment</h2>

          <label className="label">Title</label>
          <input
            type="text"
            className="input mb-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Add third chest day"
          />

          <label className="label">Intervention / Change</label>
          <textarea
            className="textarea mb-3"
            value={intervention}
            onChange={(e) => setIntervention(e.target.value)}
            placeholder="What are you changing?"
            rows={3}
          />

          <label className="label">Baseline Description (optional)</label>
          <textarea
            className="textarea mb-4"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            placeholder="Current performance for comparison"
            rows={3}
          />

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!title.trim() || !intervention.trim() || createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Start Experiment'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
