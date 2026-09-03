import { prismaTestClient } from './prisma-test-client';

export async function seedEvent(
  overrides: {
    status?: 'DRAFT' | 'PUBLISHED';
    startsAt?: Date;
    name?: string;
    capacity?: number;
    studentCapacity?: number;
  } = {},
) {
  return prismaTestClient.event.create({
    data: {
      name: overrides.name ?? 'TEDxUCB de prueba',
      startsAt: overrides.startsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 días
      status: overrides.status ?? 'PUBLISHED',
      capacity: overrides.capacity,
      studentCapacity: overrides.studentCapacity,
    },
  });
}

export async function seedContentBlock(
  overrides: { key?: string; body?: string; title?: string } = {},
) {
  return prismaTestClient.contentBlock.create({
    data: {
      key: overrides.key ?? `bloque_prueba_${Date.now()}`,
      title: overrides.title ?? 'Bloque de prueba',
      body: overrides.body ?? 'Cuerpo de prueba.',
    },
  });
}
