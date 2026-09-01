import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

describe('POST /api/v1/auth/login (contrato)', () => {
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

  it('devuelve 200 con un par de tokens ante credenciales válidas', async () => {
    await seedUser({ email: 'maria.quispe@ucb.edu.bo', password: 'unaClaveSegura9', roles: ['ALUMNO'] });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'maria.quispe@ucb.edu.bo', password: 'unaClaveSegura9' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900,
      user: { fullName: expect.any(String), roles: ['ALUMNO'], status: 'ACTIVE' },
    });
  });

  it('rechaza con 401 INVALID_CREDENTIALS si la contraseña es incorrecta', async () => {
    await seedUser({ email: 'maria.quispe@ucb.edu.bo', password: 'unaClaveSegura9' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'maria.quispe@ucb.edu.bo', password: 'clave-equivocada' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('rechaza con 401 INVALID_CREDENTIALS si el correo no existe (mismo mensaje, anti-enumeración)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@ucb.edu.bo', password: 'unaClaveSegura9' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('rechaza con 403 ACCOUNT_NOT_ACTIVE si la cuenta está pendiente de verificación', async () => {
    await seedUser({
      email: 'pendiente@ucb.edu.bo',
      password: 'unaClaveSegura9',
      status: 'PENDING',
      registrationSource: 'SELF_REGISTRATION',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'pendiente@ucb.edu.bo', password: 'unaClaveSegura9' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'ACCOUNT_NOT_ACTIVE', details: { status: 'PENDING' } });
  });

  it('rechaza una petición mal formada con 400 VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'no-es-un-correo', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
