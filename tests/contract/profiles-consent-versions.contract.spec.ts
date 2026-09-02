import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedConsentVersion } from '../support/seed-catalog';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Versiones de consentimiento (contrato, RF-128)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  it('GET /public/consent-version devuelve la versión activa, sin autenticación', async () => {
    await seedConsentVersion({ active: true });

    const response = await request(app.getHttpServer()).get('/api/v1/public/consent-version');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('body');
  });

  it('POST /consent-versions crea una nueva versión y desactiva la anterior en la misma transacción', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const previous = await seedConsentVersion({ active: true });

    const response = await request(app.getHttpServer())
      .post('/api/v1/consent-versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 'v2', body: 'Texto legal real.' });

    expect(response.status).toBe(201);
    expect(response.body.isActive).toBe(true);

    const active = await request(app.getHttpServer()).get('/api/v1/public/consent-version');
    expect(active.body.id).toBe(response.body.id);
    expect(active.body.id).not.toBe(previous.id);
  });

  it('GET /consent-versions (listado) es exclusivo ADMIN', async () => {
    const staff = await seedUser({ email: 'staff@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/consent-versions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
