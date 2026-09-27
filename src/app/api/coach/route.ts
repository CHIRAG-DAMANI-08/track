import { NextResponse } from 'next/server';
import { handleCoachChat } from '@/ai/coach-chat';
import { CoachChatRequestSchema } from '@/lib/schemas';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CoachChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { conversationId, message } = parsed.data;
    const result = await handleCoachChat(conversationId, message);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Coach chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get coach response' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const conversation = await prisma.coachConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });
      return NextResponse.json({ conversation });
    }

    // List recent conversations
    const conversations = await prisma.coachConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Coach API error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
