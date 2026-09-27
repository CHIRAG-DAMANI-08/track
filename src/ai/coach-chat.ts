import { generateStructuredOutput, isGeminiConfigured } from '@/ai/gemini-client';
import { SYSTEM_PROMPT, buildCoachChatPrompt } from '@/ai/prompts';
import { CoachResponseSchema, type CoachResponse } from '@/lib/schemas';
import { prisma } from '@/lib/db';
import { getConsistencyMetrics } from '@/lib/analytics';

export async function handleCoachChat(
  conversationId: string | undefined,
  userMessage: string
): Promise<{ conversationId: string; response: CoachResponse }> {
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
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  if (!conversation) {
    conversation = await prisma.coachConversation.create({
      data: { title: userMessage.slice(0, 100) },
      include: { messages: true },
    });
  }

  // Save user message
  await prisma.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'USER',
      content: userMessage,
    },
  });

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

  // Format context
  const conversationHistory = conversation.messages
    .reverse()
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

  return { conversationId: conversation.id, response };
}
