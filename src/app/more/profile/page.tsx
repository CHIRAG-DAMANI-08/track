'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, User, Target, Dumbbell, ShieldAlert, Sparkles, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
  });

  const [form, setForm] = useState({
    firstName: 'Chirag',
    displayName: 'Chirag',
    trainingGoals: '',
    preferredTrainingStyle: '',
    preferredTrainingFrequency: '',
    equipmentContext: '',
    exercisePreferences: '',
    exerciseDislikes: '',
    constraints: '',
    coachingPreferences: '',
    generalNotes: '',
  });

  const [showSavedToast, setShowSavedToast] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      const p = data.profile;
      setForm({
        firstName: p.firstName ?? 'Chirag',
        displayName: p.displayName ?? 'Chirag',
        trainingGoals: p.trainingGoals ?? '',
        preferredTrainingStyle: p.preferredTrainingStyle ?? p.preferredSplit ?? '',
        preferredTrainingFrequency: p.preferredTrainingFrequency ?? p.trainingFrequency ?? '',
        equipmentContext: p.equipmentContext ?? '',
        exercisePreferences: p.exercisePreferences ?? p.preferences ?? '',
        exerciseDislikes: p.exerciseDislikes ?? p.dislikes ?? '',
        constraints: p.constraints ?? '',
        coachingPreferences: p.coachingPreferences ?? p.coachingNotes ?? '',
        generalNotes: p.generalNotes ?? '',
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName || 'Chirag',
          displayName: form.displayName || 'Chirag',
          trainingGoals: form.trainingGoals || null,
          preferredTrainingStyle: form.preferredTrainingStyle || null,
          preferredTrainingFrequency: form.preferredTrainingFrequency || null,
          equipmentContext: form.equipmentContext || null,
          exercisePreferences: form.exercisePreferences || null,
          exerciseDislikes: form.exerciseDislikes || null,
          constraints: form.constraints || null,
          coachingPreferences: form.coachingPreferences || null,
          generalNotes: form.generalNotes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2500);
    },
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="page-content flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="page-content pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 mb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{form.displayName || 'Chirag'}</h1>
            <p className="text-xs text-zinc-400">Your Personal Profile</p>
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Saving...</span>
            </>
          ) : showSavedToast ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save size={14} />
              <span>Save</span>
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        This profile directly guides your AI coach. Every preference, dislike, and constraint you set here is immediately considered in your workout analyses and recommendations.
      </p>

      <div className="space-y-4">
        {/* Section 1: Your Identity */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <User size={16} className="text-amber-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Identity
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs text-zinc-400">First Name</label>
              <input
                type="text"
                className="input w-full text-sm"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                placeholder="Chirag"
              />
            </div>
            <div>
              <label className="label text-xs text-zinc-400">Display Name</label>
              <input
                type="text"
                className="input w-full text-sm"
                value={form.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                placeholder="Chirag"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Your Goals */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <Target size={16} className="text-emerald-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Goals
            </h2>
          </div>

          <Field
            label="Training Goals"
            value={form.trainingGoals}
            onChange={(v) => updateField('trainingGoals', v)}
            placeholder="e.g. Build pressing strength, increase pull-up volume, progressive overload on compounds"
            multiline
            rows={3}
            hint="Your primary training objectives and priorities."
          />
        </div>

        {/* Section 3: Your Training */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <Dumbbell size={16} className="text-indigo-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Training
            </h2>
          </div>

          <Field
            label="Preferred Training Style"
            value={form.preferredTrainingStyle}
            onChange={(v) => updateField('preferredTrainingStyle', v)}
            placeholder="e.g. Upper / Lower, Push / Pull / Legs, Full Body"
          />

          <Field
            label="Preferred Frequency"
            value={form.preferredTrainingFrequency}
            onChange={(v) => updateField('preferredTrainingFrequency', v)}
            placeholder="e.g. 4 days per week (Mon, Tue, Thu, Fri)"
          />

          <Field
            label="Equipment Context"
            value={form.equipmentContext}
            onChange={(v) => updateField('equipmentContext', v)}
            placeholder="e.g. Commercial gym with barbells, power rack, dumbbells up to 50kg, cables, and machines"
            multiline
            rows={2}
            hint="The coach will only recommend exercises you have the equipment for."
          />
        </div>

        {/* Section 4: Your Preferences & Dislikes */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <Sparkles size={16} className="text-yellow-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Preferences
            </h2>
          </div>

          <Field
            label="Exercise Preferences"
            value={form.exercisePreferences}
            onChange={(v) => updateField('exercisePreferences', v)}
            placeholder="e.g. Prefer incline dumbbell bench over flat barbell, enjoy neutral grip pull-ups"
            multiline
            rows={2}
          />

          <Field
            label="Exercise Dislikes"
            value={form.exerciseDislikes}
            onChange={(v) => updateField('exerciseDislikes', v)}
            placeholder="e.g. Dislike barbell overhead press, prefer seated dumbbell press"
            multiline
            rows={2}
            hint="Exercises listed here will NOT be recommended by the coach."
          />
        </div>

        {/* Section 5: Your Constraints */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <ShieldAlert size={16} className="text-red-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Constraints
            </h2>
          </div>

          <Field
            label="Physical & Schedule Constraints"
            value={form.constraints}
            onChange={(v) => updateField('constraints', v)}
            placeholder="e.g. Occasional right shoulder impingement on wide grip, limit sessions to 60 minutes"
            multiline
            rows={2}
            hint="Injury history or strict limitations the coach must always respect."
          />
        </div>

        {/* Section 6: Your Coaching Style */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <Sparkles size={16} className="text-cyan-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Your Coaching Style
            </h2>
          </div>

          <Field
            label="Coaching Preferences"
            value={form.coachingPreferences}
            onChange={(v) => updateField('coachingPreferences', v)}
            placeholder="e.g. Direct and analytical, provide clear evidence, focus on progression over volume"
            multiline
            rows={2}
          />

          <Field
            label="General Notes"
            value={form.generalNotes}
            onChange={(v) => updateField('generalNotes', v)}
            placeholder="Any other personal context you want your coach to keep in mind"
            multiline
            rows={2}
          />
        </div>
      </div>

      {saveMutation.isError && (
        <div className="p-3 rounded-lg mt-4 bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          Failed to save profile changes. Please try again.
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-300 mb-1">{label}</label>
      {multiline ? (
        <textarea
          className="textarea w-full text-xs leading-relaxed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <input
          type="text"
          className="input w-full text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
