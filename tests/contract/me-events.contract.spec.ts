import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

async function seedEvent(name: string, slug: string) {
  const [event] = await prismaTestClient.$queryRawUnsafe<Array<{ id: string }>>(
    'INSERT INTO events (name, starts_at, slug) VALUES ($1, $2, $3) RETURNING id::text AS id',
    name,
    new Date('2027-01-01T12:00:00Z'),
    slug,
  );
  return { ...event, name, slug };
}

describe('GET /api/v1/me/events (contrato RF-503/512)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await prismaTestClient.$disconnect();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  it('un correo UCB solo recibe el acceso institucional con email verificado y Workspace exactos', async () => {
    const tedx = await seedEvent('TEDxUCB', 'tedxucb');
    const week = await seedEvent('Innovation Week', 'innovation-week');
    const user = await seedUser({ email: 'institucional@ucb.edu.bo' });
    await prismaTestClient.userIdentity.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        subject: 'sub-institucional-test',
        verifiedEmail: user.email,
        hostedDomain: 'ucb.edu.bo',
      },
    });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/events')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((event: { id: string }) => event.id).sort()).toEqual([tedx.id, week.id].sort());
    expect(response.body.data.map((event: { slug: string }) => event.slug).sort()).toEqual(['innovation-week', 'tedxucb']);
  });

  it('un correo externo ve únicamente sus eventos autorizados y la revocación surte efecto en la sesión vigente', async () => {
    const tedx = await seedEvent('TEDxUCB', 'tedxucb');
    await seedEvent('Innovation Week', 'innovation-week');
    const external = await seedUser({ email: 'persona@gmail.com' });
    const authorization = await prismaTestClient.eventEmailAccess.create({
      data: { emailNormalized: external.email, eventId: tedx.id },
    });
    const token = await loginAs(app, external.email);

    const beforeRevoke = await request(app.getHttpServer())
      .get('/api/v1/me/events')
      .set('Authorization', `Bearer ${token}`);
    expect(beforeRevoke.status).toBe(200);
    expect(beforeRevoke.body.data).toHaveLength(1);
    expect(beforeRevoke.body.data[0]).toMatchObject({ id: tedx.id, slug: 'tedxucb' });

    await prismaTestClient.eventEmailAccess.update({
      where: { id: authorization.id },
      data: { revokedAt: new Date() },
    });
    const afterRevoke = await request(app.getHttpServer())
      .get('/api/v1/me/events')
      .set('Authorization', `Bearer ${token}`);
    expect(afterRevoke.status).toBe(200);
    expect(afterRevoke.body.data).toEqual([]);
  });

  it('requiere sesión y no expone eventos sin token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/events');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });
});
