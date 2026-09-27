import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ProfileUpdateSchema } from '@/lib/schemas';

export async function GET() {
  try {
    let profile = await prisma.athleteProfile.findFirst();
    if (!profile) {
      profile = await prisma.athleteProfile.create({
        data: {
          id: 'singleton',
          firstName: 'Chirag',
          displayName: 'Chirag',
        },
      });
    } else if (!profile.firstName || !profile.displayName) {
      profile = await prisma.athleteProfile.update({
        where: { id: profile.id },
        data: {
          firstName: profile.firstName || 'Chirag',
          displayName: profile.displayName || 'Chirag',
        },
      });
    }

    const goals = await prisma.athleteGoal.findMany({
      where: { profileId: 'singleton' },
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json({ profile, goals });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = ProfileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { ...parsed.data };

    // Synchronize legacy mirrored fields
    if (parsed.data.preferredTrainingStyle !== undefined) {
      updateData.preferredSplit = parsed.data.preferredTrainingStyle;
    }
    if (parsed.data.preferredTrainingFrequency !== undefined) {
      updateData.trainingFrequency = parsed.data.preferredTrainingFrequency;
    }
    if (parsed.data.exercisePreferences !== undefined) {
      updateData.preferences = parsed.data.exercisePreferences;
    }
    if (parsed.data.exerciseDislikes !== undefined) {
      updateData.dislikes = parsed.data.exerciseDislikes;
    }
    if (parsed.data.coachingPreferences !== undefined) {
      updateData.coachingNotes = parsed.data.coachingPreferences;
    }

    // Always preserve Chirag's identity if left blank
    if (updateData.firstName === '' || updateData.firstName === null) {
      updateData.firstName = 'Chirag';
    }
    if (updateData.displayName === '' || updateData.displayName === null) {
      updateData.displayName = 'Chirag';
    }

    const profile = await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: updateData,
      create: {
        id: 'singleton',
        firstName: 'Chirag',
        displayName: 'Chirag',
        ...updateData,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
