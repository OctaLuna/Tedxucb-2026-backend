import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

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

  it('rechaza con 401 un token de acceso inválido', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer token-invalido');

    expect(response.status).toBe(401);
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
