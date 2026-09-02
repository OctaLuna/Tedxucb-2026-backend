import { prismaTestClient } from './prisma-test-client';
import { seedUser } from './seed-user';

export async function seedActivityCategory(
  overrides: Partial<{ name: string; color: string; suggestedPoints: number }> = {},
) {
  return prismaTestClient.activityCategory.create({
    data: { name: overrides.name ?? `Categoría de prueba ${Date.now()}-${Math.random()}`, ...overrides },
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
  }> = {},
) {
  const now = Date.now();
  const { createdById, ...rest } = overrides;
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
  return prismaTestClient.activityStaff.create({ data: { activityId, userId } });
}
