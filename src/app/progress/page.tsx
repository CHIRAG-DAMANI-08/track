'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  TrendingUp,
  Dumbbell,
  Target,
  Activity,
  Calendar,
  Brain,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import dynamic from 'next/dynamic';
import {
  MuscleMapSheet,
  type MuscleExposureDetail,
  type MuscleMapState,
} from '@/components/anatomy';
import type { CoachRead } from '@/ai/muscle-coach-read';

const DynamicMuscleMap = dynamic(
  () => import('@/components/anatomy').then((m) => m.MuscleMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 animate-pulse min-h-[300px]">
        <span className="text-xs text-zinc-500 font-medium">Loading anatomy...</span>
      </div>
    ),
  }
);

type TabKey = 'muscles' | 'volume' | 'strength' | 'frequency' | 'consistency';
const TABS: { key: TabKey; label: string; icon: typeof Target }[] = [
  { key: 'muscles', label: 'Muscles', icon: Target },
  { key: 'volume', label: 'Volume', icon: Dumbbell },
  { key: 'strength', label: 'Strength', icon: TrendingUp },
  { key: 'frequency', label: 'Frequency', icon: Calendar },
  { key: 'consistency', label: 'Consistency', icon: Activity },
];

const RANGES = ['1m', '3m', '6m', '1y', 'all'] as const;

const MUSCLE_RANGES = [
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: '4w', label: '4 weeks' },
  { key: '8w', label: '8 weeks' },
  { key: 'custom', label: 'Custom' },
] as const;

export default function ProgressPage() {
  const [tab, setTab] = useState<TabKey>('muscles');
  const [range, setRange] = useState<string>('3m');
  const [muscleRange, setMuscleRange] = useState<string>('this-week');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  return (
    <div className="page-content">
      <div className="pt-2 mb-2">
        <h1 className="text-2xl font-bold">Progress</h1>
      </div>

      {/* Tab Control */}
      <div className="segment-control">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`segment-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Range Selector */}
      {tab === 'muscles' ? (
        <div className="space-y-2 mb-2">
          <div className="segment-control">
            {MUSCLE_RANGES.map((r) => (
              <button
                key={r.key}
                className={`segment-item ${muscleRange === r.key ? 'active' : ''}`}
                onClick={() => setMuscleRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {muscleRange === 'custom' && (
            <div className="card p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[130px]">
                <label className="text-xs text-zinc-400 block mb-1">Start Date</label>
                <input
                  type="date"
                  className="input text-xs py-1.5 px-2 w-full"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="text-xs text-zinc-400 block mb-1">End Date</label>
                <input
                  type="date"
                  className="input text-xs py-1.5 px-2 w-full"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      ) : tab !== 'consistency' ? (
        <div className="segment-control">
          {RANGES.map((r) => (
            <button
              key={r}
              className={`segment-item ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}

      {/* Content */}
      {tab === 'muscles' && (
        <WeeklyMuscleCoverageView
          range={muscleRange}
          customStart={customStart}
          customEnd={customEnd}
        />
      )}
      {tab === 'volume' && <VolumeChart range={range} />}
      {tab === 'strength' && <StrengthChart range={range} />}
      {tab === 'frequency' && <FrequencyChart range={range} />}
      {tab === 'consistency' && <ConsistencyView />}
    </div>
  );
}

// ============================================================================
// WEEKLY MUSCLE COVERAGE COMPONENT
// ============================================================================

function WeeklyMuscleCoverageView({
  range,
  customStart,
  customEnd,
}: {
  range: string;
  customStart: string;
  customEnd: string;
}) {
  const router = useRouter();
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleExposureDetail | null>(null);
  const [selectedMuscleId, setSelectedMuscleId] = useState<string | null>(null);

  const isCustomReady = range !== 'custom' || (!!customStart && !!customEnd);

  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'muscles', range, customStart, customEnd],
    queryFn: async () => {
      let url = `/api/progress?metric=muscles&range=${range}`;
      if (range === 'custom') {
        url += `&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load muscle coverage');
      return res.json();
    },
    enabled: isCustomReady,
  });

  if (!isCustomReady) {
    return (
      <div className="card text-center py-8">
        <Calendar className="mx-auto mb-2 text-zinc-500" size={24} />
        <p className="text-sm font-medium text-zinc-300">Choose Date Range</p>
        <p className="text-xs text-zinc-500 mt-1">Select start and end dates to calculate muscle coverage.</p>
      </div>
    );
  }

  if (isLoading) {
    return <ChartSkeleton />;
  }

  const muscleMapState: MuscleMapState | undefined = data?.muscleMapState;
  const period = data?.period;
  const totalWorkoutsInDb: number = data?.totalWorkoutsInDb ?? 0;
  const workoutsInPeriod = muscleMapState?.totalWorkouts ?? 0;

  // Local timezone formatted period string
  const formatPeriod = () => {
    if (!period?.startDate || !period?.endDate) return '';
    try {
      const s = new Date(period.startDate);
      const e = new Date(period.endDate);
      const sameYear = s.getFullYear() === e.getFullYear();
      const sStr = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const eStr = e.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric',
      });
      return `${sStr} – ${eStr}`;
    } catch {
      return '';
    }
  };

  const periodLabel = formatPeriod();

  // Handle muscle selection on SVG or lists
  const handleSelectMuscle = (muscleId: string) => {
    setSelectedMuscleId(muscleId);
    if (muscleMapState?.muscles && muscleMapState.muscles[muscleId]) {
      setSelectedMuscle(muscleMapState.muscles[muscleId]);
    }
  };

  const highExposure = muscleMapState?.mostExposure ?? [];
  const moderateExposure = muscleMapState?.moderateExposure ?? [];
  const lowExposure = muscleMapState?.lowerExposure ?? [];

  // EMPTY STATE 1: No workouts in database at all
  if (totalWorkoutsInDb === 0) {
    return (
      <div className="space-y-4">
        <div className="card text-center py-8">
          <div className="max-w-[280px] mx-auto mb-4 opacity-40">
            <DynamicMuscleMap bodyState={{}} hasData={false} showControls={false} showLegend={false} compact={true} />
          </div>
          <Target className="mx-auto mb-2 text-zinc-500" size={28} />
          <h3 className="font-semibold text-base mb-1">Your muscle map will appear after you import your first workout.</h3>
          <p className="text-xs text-zinc-400 mb-4">
            Import a workout from Hevy to see your full-body training exposure visualized.
          </p>
          <button onClick={() => router.push('/')} className="btn-primary text-sm">
            Import Hevy
          </button>
        </div>
      </div>
    );
  }

  // EMPTY STATE 2: Database has workouts, but none in this specific selected period
  if (workoutsInPeriod === 0) {
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-400">
                Weekly Muscle Coverage
              </h2>
              {periodLabel && <p className="text-xs text-zinc-500 mt-0.5">{periodLabel}</p>}
            </div>
          </div>
          <div className="my-2">
            <DynamicMuscleMap bodyState={{}} hasData={false} showControls={true} showLegend={false} />
          </div>
        </div>

        <div className="card text-center py-6">
          <p className="text-sm font-medium text-zinc-300">Nothing recorded for this period.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Try choosing &quot;4 weeks&quot; or &quot;8 weeks&quot; to review previous training exposure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Unmapped exercises warning */}
      {muscleMapState?.unmappedExercises && muscleMapState.unmappedExercises.length > 0 && (
        <div className="card p-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <p className="font-semibold">Some exercises do not have muscle mappings yet</p>
            <p className="text-zinc-400 mt-0.5">
              {muscleMapState.unmappedExercises.slice(0, 3).map((e) => e.name).join(', ')}
              {muscleMapState.unmappedExercises.length > 3 ? ` and ${muscleMapState.unmappedExercises.length - 3} more` : ''}
            </p>
            <button
              onClick={() => router.push('/more/exercises')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 underline"
            >
              Review in Exercise Library →
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Anatomy Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
              Weekly Muscle Coverage
            </h2>
            {periodLabel && (
              <p className="text-xs text-zinc-500 mt-0.5">{periodLabel}</p>
            )}
          </div>
          <div className="text-right">
            <span className="badge badge-accent text-xs">
              {muscleMapState?.totalWorkingSets ?? 0} working sets
            </span>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {workoutsInPeriod} {workoutsInPeriod === 1 ? 'workout' : 'workouts'}
            </p>
          </div>
        </div>

        {/* Dynamic interactive body map */}
        <div className="my-2">
          <DynamicMuscleMap
            bodyState={muscleMapState?.bodyState ?? {}}
            selectedMuscleId={selectedMuscleId}
            onSelectMuscle={handleSelectMuscle}
            showControls={true}
            showLegend={true}
          />
        </div>

        <p className="text-[11px] text-zinc-500 text-center mt-3">
          Tap any highlighted muscle to trace contributing exercises and sets
        </p>
      </div>

      {/* Exposure Breakdown (Neutral, objective categories) */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">
          Recorded Training Exposure
        </h3>

        {highExposure.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Most training exposure
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {highExposure.map((m) => (
                <button
                  key={m.muscleId}
                  onClick={() => {
                    setSelectedMuscleId(m.muscleId);
                    setSelectedMuscle(m);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-left transition-colors flex items-center gap-2"
                >
                  <span className="font-medium text-white">{m.displayName}</span>
                  <span className="text-[11px] text-zinc-400">{m.workingSets} sets</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {moderateExposure.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Moderate exposure
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {moderateExposure.map((m) => (
                <button
                  key={m.muscleId}
                  onClick={() => {
                    setSelectedMuscleId(m.muscleId);
                    setSelectedMuscle(m);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-left transition-colors flex items-center gap-2"
                >
                  <span className="font-medium text-white">{m.displayName}</span>
                  <span className="text-[11px] text-zinc-400">{m.workingSets} sets</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {lowExposure.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                Lower recorded exposure
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lowExposure.map((m) => (
                <button
                  key={m.muscleId}
                  onClick={() => {
                    setSelectedMuscleId(m.muscleId);
                    setSelectedMuscle(m);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-left transition-colors flex items-center gap-2"
                >
                  <span className="font-medium text-zinc-300">{m.displayName}</span>
                  <span className="text-[11px] text-zinc-500">{m.workingSets} sets</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI COACH'S READ SECTION */}
      {muscleMapState && (
        <CoachReadCard
          muscleMapState={muscleMapState}
          periodLabel={periodLabel || range}
        />
      )}

      {/* Muscle Detail Bottom Sheet */}
      {selectedMuscle && (
        <MuscleMapSheet
          muscle={selectedMuscle}
          onClose={() => {
            setSelectedMuscle(null);
            setSelectedMuscleId(null);
          }}
          onViewExercise={(exId) => router.push(`/exercise/${exId}`)}
        />
      )}
    </div>
  );
}

// ============================================================================
// COACH READ CARD
// ============================================================================

function CoachReadCard({
  muscleMapState,
  periodLabel,
}: {
  muscleMapState: MuscleMapState;
  periodLabel: string;
}) {
  const [coachRead, setCoachRead] = useState<CoachRead | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCoachRead = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'coach-read',
          muscleMapState,
          periodLabel,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate interpretation');
      }
      const data = await res.json();
      setCoachRead(data.coachRead);
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={18} style={{ color: 'var(--color-info)' }} />
          <div>
            <h3 className="text-sm font-semibold text-white">Coach&apos;s Read</h3>
            <p className="text-xs text-zinc-400">AI interpretation of muscle exposure</p>
          </div>
        </div>

        {!coachRead ? (
          <button
            onClick={fetchCoachRead}
            disabled={isLoading}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Sparkles size={13} className="text-amber-400" />
                <span>Get Read</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-white/5"
            aria-label="Toggle Coach Read"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {coachRead && isOpen && (
        <div className="mt-4 pt-3 border-t border-white/10 space-y-4">
          <div>
            <p className="text-xs text-zinc-300 leading-relaxed">{coachRead.summary}</p>
          </div>

          {coachRead.whatChanged.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                What Changed
              </span>
              <ul className="space-y-1">
                {coachRead.whatChanged.map((item: string, i: number) => (
                  <li key={i} className="text-xs text-zinc-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-zinc-500">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coachRead.whatStayedConsistent.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                What Stayed Consistent
              </span>
              <ul className="space-y-1">
                {coachRead.whatStayedConsistent.map((item: string, i: number) => (
                  <li key={i} className="text-xs text-zinc-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-zinc-500">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coachRead.whatToWatch.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                What To Watch
              </span>
              <ul className="space-y-1">
                {coachRead.whatToWatch.map((item: string, i: number) => (
                  <li key={i} className="text-xs text-zinc-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-amber-500">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OTHER TABS (VOLUME, STRENGTH, FREQUENCY, CONSISTENCY)
// ============================================================================

function VolumeChart({ range }: { range: string }) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'volume', range],
    queryFn: async () => {
      const res = await fetch(`/api/progress?metric=volume&range=${range}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <ChartSkeleton />;
  const trends = data?.trends ?? [];
  if (trends.length === 0) return <EmptyChart message="Import workouts to see volume trends" />;

  const chartData = trends.map(
    (t: { period: string; totalVolume: number; totalSets: number; sessionCount: number }) => ({
      week: t.period.slice(5),
      volume: Math.round(t.totalVolume),
      sets: t.totalSets,
      sessions: t.sessionCount,
    })
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Weekly Volume (kg)
        </h3>
        <div className="inline-flex rounded-lg p-0.5 bg-black/40 border border-white/5">
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
              chartType === 'line'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Line
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
              chartType === 'bar'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Bar
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'line' ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e8a034" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#e8a034" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#68687a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#68687a' }} width={45} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{
                background: '#1c1c22',
                border: '1px solid #ffffff14',
                borderRadius: '10px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#a0a0b0' }}
              formatter={(val: unknown) => [
                `${Number(val ?? 0).toLocaleString()} kg`,
                'Volume',
              ]}
            />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="#e8a034"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#volumeGradient)"
              dot={{ r: 3.5, fill: '#e8a034', stroke: '#141418', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#f0b050' }}
            />
          </AreaChart>
        ) : (
          <BarChart data={chartData}>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#68687a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#68687a' }} width={45} />
            <Tooltip
              contentStyle={{
                background: '#1c1c22',
                border: '1px solid #ffffff14',
                borderRadius: '10px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#a0a0b0' }}
              formatter={(val: unknown) => [
                `${Number(val ?? 0).toLocaleString()} kg`,
                'Volume',
              ]}
            />
            <Bar dataKey="volume" fill="#e8a034" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function StrengthChart({ range }: { range: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'strength', range],
    queryFn: async () => {
      const res = await fetch(`/api/progress?metric=strength&range=${range}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <ChartSkeleton />;
  const strengthData = data?.strengthData ?? [];
  if (strengthData.length === 0) return <EmptyChart message="Import workouts to see strength trends" />;

  const exercise = strengthData[0];
  const chartData = exercise.entries
    .filter((e: { estimated1RM: number | null }) => e.estimated1RM)
    .map(
      (e: { date: string; estimated1RM: number; bestWeight: number; bestReps: number }) => ({
        date: new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        e1rm: Math.round(e.estimated1RM),
        weight: e.bestWeight,
      })
    )
    .reverse();

  return (
    <div className="card">
      <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        Estimated 1RM — {exercise.exerciseName}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
        Epley formula · based on working sets ≤12 reps
      </p>
      {chartData.length < 2 ? (
        <EmptyChart message="Need at least 2 sessions to show a trend" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
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
      )}

      {strengthData.length > 1 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Other exercises tracked:</p>
          <div className="flex flex-wrap gap-2">
            {strengthData.slice(1).map((ex: { exerciseId: string; exerciseName: string }) => (
              <span key={ex.exerciseId} className="badge badge-accent">{ex.exerciseName}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FrequencyChart({ range }: { range: string }) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'frequency', range],
    queryFn: async () => {
      const res = await fetch(`/api/progress?metric=frequency&range=${range}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <ChartSkeleton />;
  const frequency = data?.frequency ?? [];
  if (frequency.length === 0) return <EmptyChart message="Import workouts to see training frequency" />;

  const chartData = frequency.map((f: { week: string; sessions: number }) => ({
    week: f.week.slice(5),
    sessions: f.sessions,
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Weekly Sessions
        </h3>
        <div className="inline-flex rounded-lg p-0.5 bg-black/40 border border-white/5">
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
              chartType === 'line'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Line
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
              chartType === 'bar'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Bar
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'line' ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#68687a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#68687a' }} width={30} allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{
                background: '#1c1c22',
                border: '1px solid #ffffff14',
                borderRadius: '10px',
                fontSize: '12px',
              }}
              formatter={(val: unknown) => [`${val ?? 0} sessions`, 'Frequency']}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#34d399"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#freqGradient)"
              dot={{ r: 3.5, fill: '#34d399', stroke: '#141418', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#6ee7b7' }}
            />
          </AreaChart>
        ) : (
          <BarChart data={chartData}>
            <CartesianGrid stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#68687a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#68687a' }} width={30} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: '#1c1c22',
                border: '1px solid #ffffff14',
                borderRadius: '10px',
                fontSize: '12px',
              }}
              formatter={(val: unknown) => [`${val ?? 0} sessions`, 'Frequency']}
            />
            <Bar dataKey="sessions" fill="#34d399" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ConsistencyView() {
  const { data, isLoading } = useQuery({
    queryKey: ['progress', 'consistency'],
    queryFn: async () => {
      const res = await fetch('/api/progress?metric=consistency');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <ChartSkeleton />;
  const m = data?.metrics;
  if (!m || m.totalWorkouts === 0) return <EmptyChart message="Import workouts to see consistency metrics" />;

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          Training Consistency
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total Workouts" value={m.totalWorkouts} />
          <Stat label="Avg / Week" value={m.workoutsPerWeek} />
          <Stat label="Current Streak" value={`${m.currentStreak}w`} />
          <Stat label="Longest Streak" value={`${m.longestStreak}w`} />
          <Stat label="Training Period" value={`${m.periodDays}d`} />
          <Stat label="Days Since Last" value={m.daysSinceLastWorkout ?? '—'} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="card">
      <div className="empty-state py-8">
        <TrendingUp className="empty-state-icon" />
        <p className="empty-state-description">{message}</p>
      </div>
    </div>
  );
}
