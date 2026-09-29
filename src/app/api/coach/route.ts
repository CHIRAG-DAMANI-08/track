import { NextResponse } from 'next/server';
import { handleCoachChat } from '@/ai/coach-chat';
import { CoachChatRequestSchema } from '@/lib/schemas';
import { prisma } from '@/lib/db';
import { getGeminiClient, MODELS, isGeminiConfigured } from '@/ai/gemini-client';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle direct voice message upload (MediaRecorder audio blob)
    if (contentType.includes('multipart/form-data')) {
      if (!isGeminiConfigured()) {
        return NextResponse.json({ error: 'Gemini API is not configured' }, { status: 500 });
      }

      const formData = await request.formData();
      const audioFile = formData.get('audio') as File | null;
      const conversationId = (formData.get('conversationId') as string) || undefined;
      const duration = Number(formData.get('duration') || 0);

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
      }

      // Convert audio file to base64
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = audioFile.type || 'audio/webm';

      // Transcribe using Gemini 2.5 Flash (Google AI Studio Free Tier)
      const client = getGeminiClient();
      const transcriptionRes = await client.models.generateContent({
        model: MODELS.primary,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              {
                text: 'Transcribe this voice message accurately as spoken. Return ONLY the spoken text — do not add notes, quotation marks, prefixes, or commentary. If the audio is silent or unintelligible, return an empty string.',
              },
            ],
          },
        ],
        config: {
          temperature: 0.1,
        },
      });

      const transcription = transcriptionRes.text?.trim() || '';

      if (!transcription) {
        return NextResponse.json(
          { error: "Couldn't detect clear audio in that voice note. Please try speaking closer to your mic." },
          { status: 400 }
        );
      }

      // Now process coach response using the transcription
      const result = await handleCoachChat(conversationId, transcription, {
        isVoice: true,
        duration,
      });

      if (result.error) {
        return NextResponse.json(
          {
            error: result.error,
            conversationId: result.conversationId,
            userMessage: transcription,
            isVoice: true,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ...result,
        userMessage: transcription,
        isVoice: true,
        duration,
      });
    }

    // Handle standard JSON text message
    const body = await request.json();
    const parsed = CoachChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { conversationId, message } = parsed.data;
    const result = await handleCoachChat(conversationId, message);

    // If the AI call failed but we have a conversationId, return it with the error
    if (result.error) {
      return NextResponse.json(
        { error: result.error, conversationId: result.conversationId },
        { status: 502 }
      );
    }

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
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Coach API error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    await prisma.coachConversation.delete({
      where: { id: conversationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Coach delete error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
