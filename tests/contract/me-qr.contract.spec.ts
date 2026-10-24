import { seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedStudent } from '../support/seed-catalog';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

/**
 * El rechazo del token vencido (T013) se prueba contra el consumidor real
 * del token -- POST /activities/:id/checkin -- en checkin.contract.spec.ts
 * ("rechaza con 401 EXPIRED_QR_TOKEN un token vencido"), con el fixture
 * expiredQrToken(). GET /me/qr solo emite, no verifica -- no tiene sentido
 * duplicar esa prueba acá.
 */
describe('GET /api/v1/me/qr (contrato, RF-311 RF-312, T013)', () => {
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
    await seedTestEvent();
  });

  it('devuelve un token con expiresAt y refreshInSeconds', async () => {
    const { user: student } = await seedStudent({ email: 'alumno-qr@ucb.edu.bo' });
    const token = await loginAs(app, student.email);

    const response = await request(app.getHttpServer()).get('/api/v1/me/qr').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.refreshInSeconds).toBe(45);
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/qr');
    expect(response.status).toBe(401);
  });
});
