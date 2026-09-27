import { prisma } from '@/lib/db';
import type { AthleteProfile, AthleteMemory } from '@prisma/client';

export interface PersonalContextOptions {
  queryText?: string;
  exerciseNames?: string[];
  muscleGroups?: string[];
  includeRecentWorkouts?: boolean;
}

export interface PersonalizedCoachContext {
  athleteName: string;
  identity: {
    name: string;
    trainingGoals: string | null;
    preferredStyle: string | null;
    preferredFrequency: string | null;
    equipmentContext: string | null;
    preferences: string | null;
    dislikes: string | null;
    constraints: string | null;
    coachingPreferences: string | null;
    generalNotes: string | null;
  };
  goals: string[];
  relevantMemories: Array<{
    type: string;
    statement: string;
    confidence: number;
  }>;
  activeExperiment: {
    id: string;
    title: string;
    intervention: string;
  } | null;
  structuredJson: string;
}

/**
 * Retrieves the singleton profile, initializing it with Chirag's identity if missing.
 */
export async function getPersonalizedAthleteProfile(): Promise<AthleteProfile> {
  let profile = await prisma.athleteProfile.findFirst();

  if (!profile) {
    try {
      profile = await prisma.athleteProfile.create({
        data: {
          id: 'singleton',
          firstName: 'Chirag',
          displayName: 'Chirag',
        },
      });
    } catch {
      profile = await prisma.athleteProfile.findFirst();
    }
  }

  // Ensure default name if it was empty
  if (profile && (!profile.firstName || !profile.displayName)) {
    try {
      profile = await prisma.athleteProfile.update({
        where: { id: profile.id },
        data: {
          firstName: profile.firstName || 'Chirag',
          displayName: profile.displayName || 'Chirag',
        },
      });
    } catch (err) {
      console.warn('Could not persist default name update to DB, applying in-memory fallback:', err);
      (profile as Record<string, unknown>).firstName = profile.firstName || 'Chirag';
      (profile as Record<string, unknown>).displayName = profile.displayName || 'Chirag';
    }
  }

  return profile!;
}

/**
 * Intelligent memory retrieval:
 * - Always includes active PREFERENCE, CONSTRAINT, and PROFILE memories so coach respects boundaries.
 * - Filters OBSERVATION, HYPOTHESIS, LEARNED_PATTERN, INTERVENTION, OUTCOME memories
 *   based on relevance to current workout exercises, muscle groups, or user question.
 */
export async function getRelevantMemories(options?: {
  queryText?: string;
  exerciseNames?: string[];
  muscleGroups?: string[];
  maxCount?: number;
}): Promise<AthleteMemory[]> {
  const { queryText = '', exerciseNames = [], muscleGroups = [], maxCount = 10 } = options ?? {};

  const allActiveMemories = await prisma.athleteMemory.findMany({
    where: {
      status: { in: ['ACTIVE', 'CONFIRMED'] },
    },
    orderBy: [
      { confidence: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  if (allActiveMemories.length === 0) return [];

  // Keywords to match from query, exercise names, and muscles
  const rawTerms = [
    ...queryText.toLowerCase().split(/\s+/),
    ...exerciseNames.map(e => e.toLowerCase()),
    ...muscleGroups.map(m => m.toLowerCase()),
  ]
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 2);

  const keywords = Array.from(new Set(rawTerms));

  const mandatoryTypes = new Set(['PREFERENCE', 'CONSTRAINT', 'PROFILE']);

  // Split into mandatory (constraints/dislikes/profile) and contextual
  const mandatoryMemories: AthleteMemory[] = [];
  const contextualCandidates: Array<{ memory: AthleteMemory; score: number }> = [];

  for (const memory of allActiveMemories) {
    if (mandatoryTypes.has(memory.memoryType)) {
      mandatoryMemories.push(memory);
      continue;
    }

    if (keywords.length === 0) {
      contextualCandidates.push({ memory, score: memory.confidence });
      continue;
    }

    const statementLower = memory.statement.toLowerCase();
    let matchScore = 0;

    for (const kw of keywords) {
      if (statementLower.includes(kw)) {
        matchScore += 2;
      }
    }

    if (matchScore > 0) {
      contextualCandidates.push({ memory, score: matchScore + memory.confidence });
    }
  }

  // Sort contextual candidates by score
  contextualCandidates.sort((a, b) => b.score - a.score);

  const remainingSlots = Math.max(0, maxCount - mandatoryMemories.length);
  const selectedContextual = contextualCandidates.slice(0, remainingSlots).map(c => c.memory);

  return [...mandatoryMemories, ...selectedContextual];
}

/**
 * Builds the complete structured personalized context for Gemini.
 */
export async function buildPersonalizedCoachContext(
  options?: PersonalContextOptions
): Promise<PersonalizedCoachContext> {
  const profile = await getPersonalizedAthleteProfile();

  const [activeGoals, relevantMemories, activeExperiment] = await Promise.all([
    prisma.athleteGoal.findMany({
      where: { profileId: profile.id, status: 'ACTIVE' },
      orderBy: { priority: 'desc' },
    }),
    getRelevantMemories({
      queryText: options?.queryText,
      exerciseNames: options?.exerciseNames,
      muscleGroups: options?.muscleGroups,
    }),
    prisma.experiment.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, title: true, intervention: true },
    }),
  ]);

  const athleteName = profile.displayName || profile.firstName || 'Chirag';

  const identity = {
    name: athleteName,
    trainingGoals: profile.trainingGoals ?? null,
    preferredStyle: profile.preferredTrainingStyle ?? profile.preferredSplit ?? null,
    preferredFrequency: profile.preferredTrainingFrequency ?? profile.trainingFrequency ?? null,
    equipmentContext: profile.equipmentContext ?? null,
    preferences: profile.exercisePreferences ?? profile.preferences ?? null,
    dislikes: profile.exerciseDislikes ?? profile.dislikes ?? null,
    constraints: profile.constraints ?? null,
    coachingPreferences: profile.coachingPreferences ?? profile.coachingNotes ?? null,
    generalNotes: profile.generalNotes ?? null,
  };

  const goalsList = activeGoals.map(g => g.description);

  const formattedMemories = relevantMemories.map(m => ({
    type: m.memoryType,
    statement: m.statement,
    confidence: m.confidence,
  }));

  const structuredPayload = {
    athleteName,
    identity,
    activeGoals: goalsList,
    preferencesAndConstraints: {
      dislikes: identity.dislikes,
      constraints: identity.constraints,
      preferredStyle: identity.preferredStyle,
      equipment: identity.equipmentContext,
      preferences: identity.preferences,
    },
    activeExperiment: activeExperiment ? {
      title: activeExperiment.title,
      intervention: activeExperiment.intervention,
    } : null,
    relevantMemories: formattedMemories,
  };

  return {
    athleteName,
    identity,
    goals: goalsList,
    relevantMemories: formattedMemories,
    activeExperiment,
    structuredJson: JSON.stringify(structuredPayload, null, 2),
  };
}
