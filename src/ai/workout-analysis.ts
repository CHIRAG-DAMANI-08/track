import { generateStructuredOutput, isGeminiConfigured } from '@/ai/gemini-client';
import { SYSTEM_PROMPT, buildWorkoutAnalysisPrompt } from '@/ai/prompts';
import { WorkoutAnalysisSchema, type WorkoutAnalysis } from '@/lib/schemas';
import { prisma } from '@/lib/db';
import {
  calculateWorkoutStats,
  compareWithPrevious,
  getConsistencyMetrics,
} from '@/lib/analytics';

export async function analyzeWorkout(workoutId: string): Promise<WorkoutAnalysis> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key is not configured. Cannot analyze workout.');
  }

  // Gather context
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      exercises: {
        include: {
          sets: { orderBy: { setIndex: 'asc' } },
          exercise: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!workout) throw new Error(`Workout ${workoutId} not found`);

  const stats = await calculateWorkoutStats(workoutId);
  const comparison = await compareWithPrevious(workoutId);
  const consistency = await getConsistencyMetrics();

  // Recent history (last 10 workouts)
  const recentWorkouts = await prisma.workout.findMany({
    where: { performedAt: { lt: workout.performedAt } },
    include: {
      exercises: {
        include: {
          sets: true,
          exercise: { select: { canonicalName: true } },
        },
      },
    },
    orderBy: { performedAt: 'desc' },
    take: 10,
  });

  // Personal context and intelligent memory retrieval for Chirag
  const { buildPersonalizedCoachContext } = await import('@/lib/personalization/context');
  const exerciseNames = workout.exercises.map(e => e.exercise.canonicalName);
  const personalContext = await buildPersonalizedCoachContext({ exerciseNames });

  // Goals
  const goals = await prisma.athleteGoal.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { priority: 'desc' },
  });

  // Active experiments
  const experiments = await prisma.experiment.findMany({
    where: { status: 'ACTIVE' },
    include: { outcome: true },
  });

  // Recent recommendations
  const recommendations = await prisma.coachRecommendation.findMany({
    where: { status: 'ACTIVE' },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  // Build workout summary text
  const workoutSummary = formatWorkoutForPrompt(workout);
  const metricsText = formatMetricsForPrompt(stats, comparison, consistency);
  const historyText = formatHistoryForPrompt(recentWorkouts);

  const goalsText = goals.length > 0
    ? goals.map(g => `- ${g.description} (priority: ${g.priority})`).join('\n')
    : 'No active goals';

  const memoriesText = personalContext.relevantMemories.length > 0
    ? personalContext.relevantMemories.map(m => `- [${m.type}] ${m.statement} (confidence: ${m.confidence})`).join('\n')
    : 'No previous memories';

  const experimentsText = experiments.length > 0
    ? experiments.map(e => `- ${e.title}: ${e.intervention} (status: ${e.status})`).join('\n')
    : 'No active experiments';

  const recsText = recommendations.length > 0
    ? recommendations.map(r => `- ${r.title}: ${r.content}`).join('\n')
    : 'No previous recommendations';

  const prompt = buildWorkoutAnalysisPrompt({
    workoutSummary,
    metrics: metricsText,
    recentHistory: historyText,
    personalContextJson: personalContext.structuredJson,
    activeGoals: goalsText,
    relevantMemories: memoriesText,
    activeExperiments: experimentsText,
    previousRecommendations: recsText,
  });

  const result = await generateStructuredOutput({
    prompt,
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0.3,
    parseResponse: (text: string) => {
      const parsed = JSON.parse(text);
      return WorkoutAnalysisSchema.parse(parsed);
    },
  });

  return result;
}

// ─── Formatting helpers ─────────────────────────────────────

export function formatWorkoutForPrompt(workout: {
  name: string | null;
  performedAt: Date;
  durationMinutes: number | null;
  notes: string | null;
  exercises: Array<{
    exercise: { canonicalName: string };
    notes: string | null;
    sets: Array<{
      setType: string;
      weightKg: number | null;
      reps: number | null;
      rpe: number | null;
      rir: number | null;
      notes: string | null;
    }>;
  }>;
}): string {
  const lines = [
    `Workout: ${workout.name ?? 'Unnamed'} — ${workout.performedAt.toISOString().slice(0, 10)}`,
    workout.durationMinutes ? `Duration: ${workout.durationMinutes} minutes` : '',
    workout.notes ? `Workout Note: "${workout.notes}"` : '',
    '',
  ];

  for (const ex of workout.exercises) {
    lines.push(`${ex.exercise.canonicalName}:`);
    if (ex.notes) {
      lines.push(`  Note: "${ex.notes}"`);
    }
    for (const set of ex.sets) {
      const parts = [];
      // Set type prefix
      if (set.setType === 'WARMUP') parts.push('(WU)');
      else if (set.setType === 'DROP') parts.push('(DROP)');
      else if (set.setType === 'FAILURE') parts.push('(FAIL)');
      // Weight and reps
      if (set.weightKg !== null) parts.push(`${set.weightKg}kg`);
      if (set.reps !== null) parts.push(`× ${set.reps} reps`);
      // RPE and RIR (both independently reported, never derived)
      if (set.rpe !== null) parts.push(`@RPE ${set.rpe}`);
      if (set.rir !== null) parts.push(`RIR ${set.rir}`);
      // Set-level notes
      if (set.notes) parts.push(`"${set.notes}"`);
      lines.push(`  ${parts.join(' ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatMetricsForPrompt(
  stats: { totalSets: number; totalVolume: number; totalReps: number; exerciseCount: number },
  comparison: Array<{
    exerciseName: string;
    volumeChange: number | null;
    weightChange: number | null;
  }>,
  consistency: { totalWorkouts: number; workoutsPerWeek: number; currentStreak: number }
): string {
  const lines = [
    `Total working sets: ${stats.totalSets}`,
    `Total volume: ${stats.totalVolume} kg`,
    `Total reps: ${stats.totalReps}`,
    `Exercises: ${stats.exerciseCount}`,
    `Overall: ${consistency.totalWorkouts} workouts, ${consistency.workoutsPerWeek}/week, ${consistency.currentStreak}-week streak`,
    '',
    'Exercise vs. previous session:',
  ];

  for (const c of comparison) {
    const parts = [`  ${c.exerciseName}:`];
    if (c.volumeChange !== null) parts.push(`volume ${c.volumeChange > 0 ? '+' : ''}${c.volumeChange}%`);
    if (c.weightChange !== null) parts.push(`weight ${c.weightChange > 0 ? '+' : ''}${c.weightChange}kg`);
    if (c.volumeChange === null && c.weightChange === null) parts.push('first time or no previous data');
    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

function formatHistoryForPrompt(workouts: Array<{
  performedAt: Date;
  name: string | null;
  exercises: Array<{
    exercise: { canonicalName: string };
    sets: Array<{
      weightKg: number | null;
      reps: number | null;
      setType: string;
    }>;
  }>;
}>): string {
  if (workouts.length === 0) return 'No previous workout history.';

  return workouts.map(w => {
    const exSummary = w.exercises.map(ex => {
      const workingSets = ex.sets.filter(s => s.setType !== 'WARMUP');
      const topWeight = Math.max(...workingSets.map(s => s.weightKg ?? 0));
      return `${ex.exercise.canonicalName} (${workingSets.length} sets, top ${topWeight}kg)`;
    }).join(', ');

    return `${w.performedAt.toISOString().slice(0, 10)} — ${w.name ?? 'Unnamed'}: ${exSummary}`;
  }).join('\n');
}
