import { prismaTestClient } from './prisma-test-client';

export async function seedEvent(
  overrides: {
    status?: 'DRAFT' | 'PUBLISHED';
    startsAt?: Date;
    slug?: string;
    name?: string;
    capacity?: number;
    studentCapacity?: number;
  } = {},
) {
  const event = await prismaTestClient.event.upsert({
    where: { slug: overrides.slug ?? 'tedxucb' },
    create: {
      slug: overrides.slug ?? 'tedxucb',
      name: overrides.name ?? 'TEDxUCB de prueba',
      startsAt: overrides.startsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 días
      status: overrides.status ?? 'PUBLISHED',
      capacity: overrides.capacity,
      studentCapacity: overrides.studentCapacity,
    },
    update: {
      name: overrides.name,
      startsAt: overrides.startsAt,
      status: overrides.status,
      capacity: overrides.capacity,
      studentCapacity: overrides.studentCapacity,
    },
  });
  const admins = await prismaTestClient.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
    select: { email: true },
  });
  if (admins.length) {
    await prismaTestClient.eventEmailAccess.createMany({
      data: admins.map(({ email }) => ({ emailNormalized: email, eventId: event.id })),
      skipDuplicates: true,
    });
  }
  return event;
}

export async function seedContentBlock(
  overrides: { key?: string; body?: string; title?: string; eventSlug?: string } = {},
) {
  const slug = overrides.eventSlug ?? 'tedxucb';
  let event = await prismaTestClient.event.findUnique({ where: { slug } });
  if (!event) {
    event = await prismaTestClient.event.create({
      data: { slug, name: slug === 'tedxucb' ? 'TEDxUCB de prueba' : 'Evento de prueba', startsAt: new Date(), status: 'PUBLISHED' },
    });
  }
  const admins = await prismaTestClient.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
    select: { email: true },
  });
  if (admins.length) {
    await prismaTestClient.eventEmailAccess.createMany({
      data: admins.map(({ email }) => ({ emailNormalized: email, eventId: event.id })),
      skipDuplicates: true,
    });
  }
  return prismaTestClient.contentBlock.create({
    data: {
      eventId: event.id,
      key: overrides.key ?? `bloque_prueba_${Date.now()}`,
      title: overrides.title ?? 'Bloque de prueba',
      body: overrides.body ?? 'Cuerpo de prueba.',
    },
  });
}
