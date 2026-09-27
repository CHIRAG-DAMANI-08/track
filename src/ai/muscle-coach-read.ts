import { generateStructuredOutput, isGeminiConfigured } from '@/ai/gemini-client';
import { SYSTEM_PROMPT } from '@/ai/prompts';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import type { MuscleMapState } from '@/components/anatomy/muscle-map.types';

export const CoachReadSchema = z.object({
  summary: z.string(),
  whatChanged: z.array(z.string()).default([]),
  whatStayedConsistent: z.array(z.string()).default([]),
  whatToWatch: z.array(z.string()).default([]),
});

export type CoachRead = z.infer<typeof CoachReadSchema>;

/**
 * Generates an analytical coach interpretation of a weekly muscle map.
 * Grounded strictly in real exposure data without hallucinations.
 */
export async function generateWeeklyMuscleCoachRead(params: {
  muscleMapState: MuscleMapState;
  periodLabel: string;
}): Promise<CoachRead> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key is not configured.');
  }

  const { muscleMapState, periodLabel } = params;

  if (!muscleMapState.hasData) {
    return {
      summary: 'No training data recorded for this period.',
      whatChanged: [],
      whatStayedConsistent: [],
      whatToWatch: ['Log your upcoming sessions to begin tracking muscle exposure trends.'],
    };
  }

  // Load personal context for Chirag
  const { buildPersonalizedCoachContext } = await import('@/lib/personalization/context');
  const personalContext = await buildPersonalizedCoachContext();

  const most = muscleMapState.mostExposure.map(m =>
    `${m.displayName}: ${m.workingSets} working sets across ${m.workoutCount} workouts (${m.trendText ?? 'stable'})`
  ).join('\n') || 'None in high tier';

  const moderate = muscleMapState.moderateExposure.map(m =>
    `${m.displayName}: ${m.workingSets} working sets (${m.trendText ?? 'stable'})`
  ).join('\n') || 'None in moderate tier';

  const lower = muscleMapState.lowerExposure.map(m =>
    `${m.displayName}: ${m.workingSets} working sets (${m.trendText ?? 'stable'})`
  ).join('\n') || 'None in lower tier';

  const prompt = `You are providing an objective, sports-science grounded "Coach's Read" on Chirag's muscle training exposure for the period: ${periodLabel}. Address Chirag directly as his personal coach.

## Chirag's Profile & Context:
${personalContext.structuredJson}

## Muscle Exposure Data:
Total Recorded Workouts: ${muscleMapState.totalWorkouts}
Total Recorded Working Sets: ${muscleMapState.totalWorkingSets}

### Most Recorded Exposure (High Tier):
${most}

### Moderate Recorded Exposure:
${moderate}

### Lower Recorded Exposure:
${lower}

## Instructions:
1. Provide a concise, analytical read directly to Chirag.
2. Distinguish correlation from causation.
3. Do NOT recommend increasing volume for a muscle merely because it was in the lower tier if Chirag's split, goals, or preferences don't call for it.
4. Output strict JSON with:
{
  "summary": "1-2 sentence high-level takeaway of how training stimulus was distributed, addressed to Chirag",
  "whatChanged": ["Notable change 1 backed by data", "Notable change 2"],
  "whatStayedConsistent": ["Pattern 1 that maintained consistency"],
  "whatToWatch": ["Specific recovery or balance checkpoint to monitor"]
}`;

  return generateStructuredOutput({
    prompt,
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0.2,
    parseResponse: (text) => {
      const parsed = JSON.parse(text);
      return CoachReadSchema.parse(parsed);
    },
  });
}
