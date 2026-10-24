import { prismaTestClient } from './prisma-test-client';

export async function grantEventAccess(email: string, eventSlug = 'tedxucb') {
  const event = await prismaTestClient.event.findUniqueOrThrow({ where: { slug: eventSlug } });
  const normalizedEmail = email.toLowerCase();
  return prismaTestClient.eventEmailAccess.upsert({
    where: { emailNormalized_eventId: { emailNormalized: normalizedEmail, eventId: event.id } },
    create: { emailNormalized: normalizedEmail, eventId: event.id },
    update: { revokedAt: null },
  });
}

export async function seedTestEvent(slug = 'tedxucb') {
  const event = await prismaTestClient.event.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: slug === 'tedxucb' ? 'TEDxUCB de prueba' : 'Semana de la Facultad',
      startsAt: new Date(),
      status: 'PUBLISHED',
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
