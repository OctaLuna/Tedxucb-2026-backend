import { prismaTestClient } from './prisma-test-client';
import { seedUser } from './seed-user';
import { seedTestEvent } from './seed-events';

export async function seedActivityCategory(
  overrides: Partial<{ name: string; color: string; suggestedPoints: number; eventSlug: string }> = {},
) {
  const event = await seedTestEvent(overrides.eventSlug);
  const { eventSlug: _eventSlug, ...categoryOverrides } = overrides;
  return prismaTestClient.activityCategory.create({
    data: { eventId: event.id, name: overrides.name ?? `Categoría de prueba ${Date.now()}-${Math.random()}`, ...categoryOverrides },
  });
}

export async function seedActivity(
  overrides: Partial<{
    title: string;
    categoryId: string;
    pointsValue: number;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
    startsAt: Date;
    endsAt: Date;
    checkinOpensAt: Date;
    checkinClosesAt: Date;
    allowMultipleCheckins: boolean;
    createdById: string;
    eventSlug: string;
  }> = {},
) {
  const now = Date.now();
  const { createdById, eventSlug, ...rest } = overrides;
  const event = await seedTestEvent(eventSlug);
  let creatorId = createdById;
  if (!creatorId) {
    const admin = await seedUser({
      email: `activity-creator-${now}-${Math.random()}@ucb.edu.bo`,
      fullName: 'Creador de prueba',
      roles: ['ADMIN'],
    });
    creatorId = admin.id;
  }

  return prismaTestClient.activity.create({
    data: {
      eventId: event.id,
      title: rest.title ?? 'Actividad de prueba',
      pointsValue: rest.pointsValue ?? 10,
      status: rest.status ?? 'PUBLISHED',
      startsAt: rest.startsAt ?? new Date(now - 60 * 60 * 1000),
      endsAt: rest.endsAt ?? new Date(now + 60 * 60 * 1000),
      checkinOpensAt: rest.checkinOpensAt ?? new Date(now - 60 * 60 * 1000),
      checkinClosesAt: rest.checkinClosesAt ?? new Date(now + 60 * 60 * 1000),
      allowMultipleCheckins: rest.allowMultipleCheckins ?? false,
      categoryId: rest.categoryId,
      createdById: creatorId,
    },
  });
}

export async function seedActivityStaff(activityId: string, userId: string) {
  const [activity, user] = await Promise.all([
    prismaTestClient.activity.findUniqueOrThrow({ where: { id: activityId }, select: { eventId: true } }),
    prismaTestClient.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
  ]);
  await prismaTestClient.eventEmailAccess.upsert({
    where: { emailNormalized_eventId: { emailNormalized: user.email.toLowerCase(), eventId: activity.eventId } },
    create: { emailNormalized: user.email.toLowerCase(), eventId: activity.eventId },
    update: { revokedAt: null },
  });
  return prismaTestClient.activityStaff.create({ data: { activityId, userId } });
}
