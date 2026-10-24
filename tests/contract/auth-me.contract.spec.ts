import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedTestEvent } from '../support/seed-events';

describe('GET /api/v1/me (contrato)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
    await closeRedisTestClient();
  });

  beforeEach(async () => {
    await cleanAuthTables();
    await cleanRateLimits();
  });

  it('devuelve la identidad de la sesión autenticada, consultada fresca', async () => {
    await seedUser({ email: 'yo@ucb.edu.bo', password: 'unaClaveSegura9', fullName: 'Yo Mismo', roles: ['ALUMNO'] });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'yo@ucb.edu.bo', password: 'unaClaveSegura9' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: 'yo@ucb.edu.bo',
      fullName: 'Yo Mismo',
      roles: ['ALUMNO'],
      status: 'ACTIVE',
    });
  });

  it('rechaza con 401 sin token de acceso', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me');
    expect(response.status).toBe(401);
  });

  it('incluye todos los eventos publicados para una cuenta institucional', async () => {
    await seedTestEvent('tedxucb');
    await seedTestEvent('innovation-week');
    const user = await seedUser({ email: 'institucional@ucb.edu.bo' });
    await prismaTestClient.userIdentity.create({
      data: { userId: user.id, provider: 'GOOGLE', subject: 'google-institucional', verifiedEmail: user.email, hostedDomain: 'ucb.edu.bo' },
    });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password: 'unaClaveSegura9' });

    const response = await request(app.getHttpServer()).get('/api/v1/me/events').set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((event: { slug: string }) => event.slug).sort()).toEqual(['innovation-week', 'tedxucb']);
  });

  it('limita una cuenta externa a los eventos incluidos en su whitelist', async () => {
    const tedx = await seedTestEvent('tedxucb');
    await seedTestEvent('innovation-week');
    const user = await seedUser({ email: 'invitado@example.com' });
    await prismaTestClient.eventEmailAccess.upsert({
      where: { emailNormalized_eventId: { emailNormalized: user.email, eventId: tedx.id } },
      create: { emailNormalized: user.email, eventId: tedx.id },
      update: { revokedAt: null },
    });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password: 'unaClaveSegura9' });

    const response = await request(app.getHttpServer()).get('/api/v1/me/events').set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((event: { slug: string }) => event.slug)).toEqual(['tedxucb']);
  });

  it('rechaza con 401 un token de acceso inválido', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer token-invalido');

    expect(response.status).toBe(401);
  });

  it('bloquea inmediatamente un token previo cuando la cuenta se desactiva', async () => {
    const user = await seedUser({ email: 'cuenta-deshabilitada@example.com' });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login')
      .send({ email: user.email, password: 'unaClaveSegura9' });
    expect(login.status).toBe(200);

    await prismaTestClient.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });

    for (const path of ['/api/v1/me', '/api/v1/me/events', '/api/v1/me/profile']) {
      const response = await request(app.getHttpServer()).get(path)
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('ACCOUNT_NOT_ACTIVE');
    }
  });

  it('nunca acepta un id parametrizado: siempre responde sobre el propio autenticado', async () => {
    // GET /me no tiene ruta con :id -- la ausencia misma es el contrato
    // (skill seguridad-y-roles). Confirmamos que /me/otro-id no expone nada.
    await seedUser({ email: 'yo2@ucb.edu.bo', password: 'unaClaveSegura9' });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'yo2@ucb.edu.bo', password: 'unaClaveSegura9' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/algun-otro-id')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(404);
  });
});
