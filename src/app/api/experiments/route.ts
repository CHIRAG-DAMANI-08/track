import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CreateExperimentSchema } from '@/lib/schemas';

export async function GET() {
  try {
    const experiments = await prisma.experiment.findMany({
      include: {
        hypothesis: true,
        events: { orderBy: { recordedAt: 'desc' }, take: 5 },
        outcome: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ experiments });
  } catch (error) {
    console.error('Experiments API error:', error);
    return NextResponse.json({ error: 'Failed to fetch experiments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const parsed = CreateExperimentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const experiment = await prisma.experiment.create({
        data: {
          title: parsed.data.title,
          intervention: parsed.data.intervention,
          baselineDescription: parsed.data.baselineDescription,
          startDate: new Date(),
          targetEndDate: parsed.data.targetEndDate
            ? new Date(parsed.data.targetEndDate)
            : null,
          hypothesisId: parsed.data.hypothesisId,
          status: 'ACTIVE',
        },
      });

      return NextResponse.json({ experiment });
    }

    if (action === 'update_status') {
      const { id, status: newStatus } = body;
      const experiment = await prisma.experiment.update({
        where: { id },
        data: { status: newStatus },
      });
      return NextResponse.json({ experiment });
    }

    if (action === 'add_event') {
      const { experimentId, eventType, description } = body;
      const event = await prisma.experimentEvent.create({
        data: { experimentId, eventType, description },
      });
      return NextResponse.json({ event });
    }

    if (action === 'conclude') {
      const { experimentId, conclusion, confidence, causalClaim } = body;
      const outcome = await prisma.experimentOutcome.create({
        data: {
          experimentId,
          conclusion,
          confidence: confidence ?? 0.5,
          causalClaim: causalClaim ?? 'SUGGESTIVE',
        },
      });
      await prisma.experiment.update({
        where: { id: experimentId },
        data: { status: 'COMPLETED' },
      });
      return NextResponse.json({ outcome });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Experiments API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
