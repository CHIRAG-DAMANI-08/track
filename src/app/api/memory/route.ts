import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const where = status ? { status: status as 'CANDIDATE' | 'ACTIVE' | 'CONFIRMED' | 'DISPUTED' | 'SUPERSEDED' | 'ARCHIVED' } : {};
    
    const memories = await prisma.athleteMemory.findMany({
      where,
      include: {
        evidence: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }],
    });

    return NextResponse.json({ memories });
  } catch (error) {
    console.error('Memory API error:', error);
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing memory ID' }, { status: 400 });
    }

    if (action === 'dismiss') {
      await prisma.athleteMemory.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
    } else if (action === 'confirm') {
      await prisma.athleteMemory.update({
        where: { id },
        data: { status: 'CONFIRMED', confidence: 0.9 },
      });
    } else if (action === 'dispute') {
      await prisma.athleteMemory.update({
        where: { id },
        data: { status: 'DISPUTED' },
      });
    } else if (action === 'activate') {
      await prisma.athleteMemory.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Memory update error:', error);
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
  }
}
