import { z } from 'zod';

// ─── Parsed Hevy workout structures ─────────────────────────

export const ParsedSetSchema = z.object({
  setIndex: z.number(),
  setType: z.enum(['WARMUP', 'WORKING', 'DROP', 'FAILURE', 'CLUSTER']).default('WORKING'),
  weightKg: z.number().nullable(),
  reps: z.number().nullable(),
  durationSeconds: z.number().nullable().default(null),
  distanceMeters: z.number().nullable().default(null),
  rpe: z.number().nullable().default(null),
  isPersonalRecord: z.boolean().default(false),
  notes: z.string().nullable().default(null),
});

export const ParsedExerciseSchema = z.object({
  rawName: z.string(),
  canonicalName: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  sets: z.array(ParsedSetSchema),
});

export const ParsedWorkoutSchema = z.object({
  name: z.string().nullable().default(null),
  performedAt: z.string().nullable().default(null),
  durationMinutes: z.number().nullable().default(null),
  notes: z.string().nullable().default(null),
  exercises: z.array(ParsedExerciseSchema),
});

export type ParsedSet = z.infer<typeof ParsedSetSchema>;
export type ParsedExercise = z.infer<typeof ParsedExerciseSchema>;
export type ParsedWorkout = z.infer<typeof ParsedWorkoutSchema>;

// ─── AI Analysis output schemas ─────────────────────────────

// Coerce confidence to a valid float between 0 and 1
const CoerceConfidence = z.preprocess((val) => {
  if (typeof val === 'number') {
    return Math.max(0, Math.min(1, val));
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      if (parsed > 1 && parsed <= 100) return parsed / 100;
      return Math.max(0, Math.min(1, parsed));
    }
    const lower = val.toLowerCase();
    if (lower.includes('high')) return 0.9;
    if (lower.includes('med')) return 0.6;
    if (lower.includes('low')) return 0.3;
  }
  return 0.5;
}, z.number().min(0).max(1));

// Coerce priority to an integer between 0 and 10
const CoercePriority = z.preprocess((val) => {
  if (typeof val === 'number') return Math.max(0, Math.min(10, Math.round(val)));
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return Math.max(0, Math.min(10, parsed));
    const lower = val.toLowerCase();
    if (lower.includes('high') || lower.includes('urgent')) return 9;
    if (lower.includes('med')) return 5;
    if (lower.includes('low')) return 2;
  }
  return 5;
}, z.number().min(0).max(10));

// Normalize observation types to valid uppercase enum values
const ObservationTypeSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const u = val.toUpperCase().trim().replace(/[\s-]+/g, '_');
    if (['FACTUAL', 'INTERPRETATION', 'TREND', 'CONCERN', 'PRAISE'].includes(u)) return u;
    if (u.includes('FACT')) return 'FACTUAL';
    if (u.includes('TREND')) return 'TREND';
    if (u.includes('CONCERN') || u.includes('ISSUE') || u.includes('WARN')) return 'CONCERN';
    if (u.includes('PRAISE') || u.includes('GOOD') || u.includes('WIN') || u.includes('POSITIVE')) return 'PRAISE';
    return 'INTERPRETATION';
  }
  return 'INTERPRETATION';
}, z.enum(['FACTUAL', 'INTERPRETATION', 'TREND', 'CONCERN', 'PRAISE']));

// Normalize memory types to valid uppercase enum values
const MemoryTypeSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const u = val.toUpperCase().trim().replace(/[\s-]+/g, '_');
    const valid = [
      'PROFILE', 'PREFERENCE', 'CONSTRAINT', 'OBSERVATION',
      'HYPOTHESIS', 'INTERVENTION', 'OUTCOME', 'LEARNED_PATTERN'
    ];
    if (valid.includes(u)) return u;
    if (u.includes('PATTERN')) return 'LEARNED_PATTERN';
    if (u.includes('PREF')) return 'PREFERENCE';
    if (u.includes('CONST') || u.includes('LIMIT') || u.includes('INJUR')) return 'CONSTRAINT';
    if (u.includes('HYPO')) return 'HYPOTHESIS';
    if (u.includes('INTERV')) return 'INTERVENTION';
    if (u.includes('OUTCOME') || u.includes('RESULT')) return 'OUTCOME';
    if (u.includes('PROF')) return 'PROFILE';
    return 'OBSERVATION';
  }
  return 'OBSERVATION';
}, z.enum([
  'PROFILE', 'PREFERENCE', 'CONSTRAINT', 'OBSERVATION',
  'HYPOTHESIS', 'INTERVENTION', 'OUTCOME', 'LEARNED_PATTERN',
]));

const CausalClaimSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const u = val.toUpperCase().trim().replace(/[\s-]+/g, '_');
    if (['NONE', 'SUGGESTIVE', 'CONSISTENT_WITH', 'LIKELY'].includes(u)) return u;
    if (u.includes('LIKELY')) return 'LIKELY';
    if (u.includes('CONSISTENT')) return 'CONSISTENT_WITH';
    if (u.includes('SUGGEST')) return 'SUGGESTIVE';
    return 'NONE';
  }
  return 'NONE';
}, z.enum(['NONE', 'SUGGESTIVE', 'CONSISTENT_WITH', 'LIKELY']));

export const AIObservationSchema = z.object({
  type: ObservationTypeSchema,
  content: z.string(),
  confidence: CoerceConfidence,
  evidenceSummary: z.string().nullable().default(null),
});

export const AIHypothesisSchema = z.object({
  statement: z.string(),
  reasoning: z.string().default(''),
  confidence: CoerceConfidence,
  evidenceFor: z.array(z.string()).default([]),
});

export const AIRecommendationSchema = z.object({
  title: z.string(),
  content: z.string(),
  reasoning: z.string().default(''),
  priority: CoercePriority,
  category: z.string().nullable().default(null),
});

export const AICandidateMemorySchema = z.object({
  memoryType: MemoryTypeSchema,
  statement: z.string(),
  confidence: CoerceConfidence,
  reasoning: z.string().default(''),
});

export const WorkoutAnalysisSchema = z.object({
  summary: z.string().default('Workout completed.'),
  goingWell: z.array(z.string()).default([]),
  needsAttention: z.array(z.string()).default([]),
  observations: z.array(AIObservationSchema).default([]),
  hypotheses: z.array(AIHypothesisSchema).default([]),
  recommendations: z.array(AIRecommendationSchema).default([]),
  candidateMemories: z.array(AICandidateMemorySchema).default([]),
});

export type WorkoutAnalysis = z.infer<typeof WorkoutAnalysisSchema>;

export const CoachResponseSchema = z.object({
  message: z.string(),
  observations: z.array(AIObservationSchema).default([]),
  recommendations: z.array(AIRecommendationSchema).default([]),
  candidateMemories: z.array(AICandidateMemorySchema).default([]),
});

export type CoachResponse = z.infer<typeof CoachResponseSchema>;

// ─── Experiment review ──────────────────────────────────────

export const ExperimentReviewSchema = z.object({
  assessment: z.string(),
  evidenceSummary: z.string().default(''),
  confidence: CoerceConfidence,
  causalClaim: CausalClaimSchema,
  shouldContinue: z.boolean().default(true),
  reasoning: z.string().default(''),
});

export type ExperimentReview = z.infer<typeof ExperimentReviewSchema>;

// ─── API request/response schemas ───────────────────────────

export const ImportRequestSchema = z.object({
  rawText: z.string().min(1, 'Paste your Hevy workout text'),
});

export const SaveWorkoutRequestSchema = z.object({
  rawImportId: z.string(),
  workout: ParsedWorkoutSchema,
});

export const AnalyzeWorkoutRequestSchema = z.object({
  workoutId: z.string(),
});

export const CoachChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1),
});

export const ProfileUpdateSchema = z.object({
  firstName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  trainingGoals: z.string().nullable().optional(),
  preferredTrainingStyle: z.string().nullable().optional(),
  preferredTrainingFrequency: z.string().nullable().optional(),
  equipmentContext: z.string().nullable().optional(),
  exercisePreferences: z.string().nullable().optional(),
  exerciseDislikes: z.string().nullable().optional(),
  constraints: z.string().nullable().optional(),
  coachingPreferences: z.string().nullable().optional(),
  generalNotes: z.string().nullable().optional(),

  // Legacy fields
  preferredSplit: z.string().nullable().optional(),
  trainingFrequency: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  dislikes: z.string().nullable().optional(),
  coachingNotes: z.string().nullable().optional(),
});

export const CreateExperimentSchema = z.object({
  hypothesisId: z.string().optional(),
  title: z.string().min(1),
  intervention: z.string().min(1),
  baselineDescription: z.string().optional(),
  targetEndDate: z.string().optional(),
});

// ─── Progress query types ───────────────────────────────────

export type ProgressMetricType = 'strength' | 'volume' | 'frequency' | 'muscles' | 'consistency';
export type TimeRange = '1w' | '1m' | '3m' | '6m' | '1y' | 'all';
