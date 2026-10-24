import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('POST /api/v1/points/:transactionId/reverse (contrato, RF-325 RF-326, T016)', () => {
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
    await seedEvent();
  });

  async function grantBonus(token: string, studentId: string, points = 15) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, points, type: 'BONUS', reason: 'Bono inicial de prueba' });
    return response.body.transactionId as string;
  }

  it('rechaza con 404 NOT_FOUND un transactionId inexistente', async () => {
    const admin = await seedUser({ email: `admin-reverse-404-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10/reverse')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'motivo' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('rechaza con 400 REASON_REQUIRED sin motivo', async () => {
    const admin = await seedUser({ email: `admin-reverse-motivo-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-reverse-motivo-${Date.now()}@ucb.edu.bo` });
    const transactionId = await grantBonus(token, student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('REASON_REQUIRED');
  });

  it('revierte con éxito: newTotal correcto, y GET /me/points muestra ambos movimientos enlazados (trazabilidad)', async () => {
    const admin = await seedUser({ email: `admin-reverse-ok-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-reverse-ok-${Date.now()}@ucb.edu.bo` });
    const studentToken = await loginAs(app, student.email);
    const transactionId = await grantBonus(token, student.id, 15);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Registro duplicado por error del staff' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ reversesId: transactionId, newTotal: 0 });
    const reversalId = response.body.transactionId as string;

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(0);

    const history = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(history.status).toBe(200);
    const ids = history.body.data.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([transactionId, reversalId]));
    const reversalEntry = history.body.data.find((row: { id: string }) => row.id === reversalId);
    expect(reversalEntry).toMatchObject({
      type: 'REVERSAL',
      reversesId: transactionId,
      reason: 'Registro duplicado por error del staff',
    });
  });

  it('rechaza con 409 ALREADY_REVERSED una segunda reversión del mismo movimiento', async () => {
    const admin = await seedUser({ email: `admin-doble-reverse-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-doble-reverse-${Date.now()}@ucb.edu.bo` });
    const transactionId = await grantBonus(token, student.id);

    await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Primera reversión' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Segundo intento' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ALREADY_REVERSED');
  });

  it('rechaza con 422 CANNOT_REVERSE_REVERSAL revertir una reversión', async () => {
    const admin = await seedUser({ email: `admin-reverse-reversal-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-reverse-reversal-${Date.now()}@ucb.edu.bo` });
    const transactionId = await grantBonus(token, student.id);

    const reversal = await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Reversión original' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/points/${reversal.body.transactionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Intentar revertir la reversión' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('CANNOT_REVERSE_REVERSAL');
  });
});
