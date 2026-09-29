import { generateStructuredOutput, isGeminiConfigured } from '@/ai/gemini-client';
import { SYSTEM_PROMPT, buildCoachChatPrompt } from '@/ai/prompts';
import { CoachResponseSchema, type CoachResponse } from '@/lib/schemas';
import { prisma } from '@/lib/db';
import { getConsistencyMetrics } from '@/lib/analytics';
import { processMemoryCandidates } from '@/ai/memory-extraction';

export interface CoachChatResult {
  conversationId: string;
  response?: CoachResponse;
  error?: string;
  userMessage?: string;
  isVoice?: boolean;
}

export async function handleCoachChat(
  conversationId: string | undefined,
  userMessage: string,
  metadata?: { isVoice?: boolean; duration?: number }
): Promise<CoachChatResult> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key is not configured.');
  }

  // Create or get conversation
  let conversation;
  if (conversationId) {
    conversation = await prisma.coachConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 30,
        },
      },
    });
  }

  if (!conversation) {
    const title = metadata?.isVoice
      ? `Voice note${metadata.duration ? ` (${Math.floor(metadata.duration / 60)}:${(metadata.duration % 60).toString().padStart(2, '0')})` : ''}`
      : userMessage.slice(0, 100);
    conversation = await prisma.coachConversation.create({
      data: { title },
      include: { messages: true },
    });
  }

  // Save user message (including voice metadata if present)
  await prisma.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'USER',
      content: userMessage,
      structuredData: metadata ? JSON.stringify(metadata) : null,
    },
  });

  // Update conversation timestamp
  await prisma.coachConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  try {
    // Personal context and intelligent memory retrieval for Chirag
    const { buildPersonalizedCoachContext } = await import('@/lib/personalization/context');
    const personalContext = await buildPersonalizedCoachContext({ queryText: userMessage });

    const recentWorkouts = await prisma.workout.findMany({
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
    const consistency = await getConsistencyMetrics();
    const experiments = await prisma.experiment.findMany({
      where: { status: 'ACTIVE' },
    });

    // Format context — use full conversation history (including the message we just saved)
    const allMessages = await prisma.coachMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    const conversationHistory = allMessages
      .map(m => `${m.role === 'USER' ? 'Chirag' : 'Coach'}: ${m.content}`)
      .join('\n');

    const workoutsText = recentWorkouts.length > 0
      ? recentWorkouts.map(w => {
          const exList = w.exercises.map(e => e.exercise.canonicalName).join(', ');
          return `${w.performedAt.toISOString().slice(0, 10)}: ${w.name ?? 'Unnamed'} (${exList})`;
        }).join('\n')
      : 'No workouts recorded yet.';

    const metricsText = `${consistency.totalWorkouts} total workouts, ${consistency.workoutsPerWeek}/week avg, ${consistency.currentStreak}-week streak`;

    const memoriesText = personalContext.relevantMemories.length > 0
      ? personalContext.relevantMemories.map(m => `[${m.type}] ${m.statement} (confidence: ${m.confidence})`).join('\n')
      : 'No memories yet.';

    const experimentsText = experiments.length > 0
      ? experiments.map(e => `${e.title}: ${e.intervention}`).join('\n')
      : 'No active experiments.';

    const prompt = buildCoachChatPrompt({
      conversationHistory,
      userMessage,
      personalContextJson: personalContext.structuredJson,
      recentWorkouts: workoutsText,
      relevantMetrics: metricsText,
      relevantMemories: memoriesText,
      activeExperiments: experimentsText,
    });

    const response = await generateStructuredOutput({
      prompt,
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.4,
      parseResponse: (text: string) => {
        const parsed = JSON.parse(text);
        return CoachResponseSchema.parse(parsed);
      },
    });

    // Save coach response
    await prisma.coachMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'COACH',
        content: response.message,
        structuredData: JSON.stringify(response),
      },
    });

    // Process candidate memories in the background (non-blocking)
    if (response.candidateMemories && response.candidateMemories.length > 0) {
      processMemoryCandidates(
        response.candidateMemories,
        'COACH_CHAT',
        conversation.id
      ).catch(err => console.warn('Failed to process coach chat memories:', err));
    }

    return {
      conversationId: conversation.id,
      response,
      userMessage,
      isVoice: metadata?.isVoice,
    };
  } catch (error) {
    // Always return conversationId so client can retry on the same conversation
    const errorMessage = error instanceof Error ? error.message : 'Failed to get coach response';
    console.error('Coach chat AI error:', errorMessage);
    return {
      conversationId: conversation.id,
      error: errorMessage,
      userMessage,
      isVoice: metadata?.isVoice,
    };
  }
}
