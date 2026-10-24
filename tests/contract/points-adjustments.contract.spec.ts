import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';
import { grantEventAccess } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('POST /api/v1/points/adjustments (contrato, RF-330, T015)', () => {
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

  async function setupAdminAndStudent() {
    const admin = await seedUser({ email: `admin-ajuste-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-ajuste-${Date.now()}@ucb.edu.bo` });
    await grantEventAccess(student.email);
    return { token, student };
  }

  it('rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .send({ studentId: '3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10', points: 10, type: 'BONUS', reason: 'motivo' });
    expect(response.status).toBe(401);
  });

  it('rechaza con 403 FORBIDDEN a un STAFF', async () => {
    const staff = await seedUser({ email: `staff-ajuste-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);
    const { user: student } = await seedStudent({ email: `alumno-ajuste-staff-${Date.now()}@ucb.edu.bo` });

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: 10, type: 'BONUS', reason: 'motivo' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('rechaza con 400 REASON_REQUIRED cuando el motivo está ausente', async () => {
    const { token, student } = await setupAdminAndStudent();

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: 10, type: 'BONUS' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('REASON_REQUIRED');
  });

  it('rechaza con 400 REASON_REQUIRED cuando el motivo está vacío', async () => {
    const { token, student } = await setupAdminAndStudent();

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: 10, type: 'BONUS', reason: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('REASON_REQUIRED');
  });

  it('rechaza con 400 ZERO_POINTS cuando points es cero', async () => {
    const { token, student } = await setupAdminAndStudent();

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: 0, type: 'BONUS', reason: 'motivo' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ZERO_POINTS');
  });

  it('rechaza con 404 NOT_FOUND un studentId inexistente', async () => {
    const admin = await seedUser({ email: `admin-ajuste-404-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: '3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10', points: 10, type: 'BONUS', reason: 'motivo' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('otorga un BONUS y devuelve transactionId/newTotal/truncated=false', async () => {
    const { token, student } = await setupAdminAndStudent();

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: 15, type: 'BONUS', reason: 'Coordinación del taller' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ newTotal: 15, truncated: false });
    expect(response.body.transactionId).toEqual(expect.any(String));

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(15);
  });

  it('una PENALTY mayor que el saldo trunca a cero y lo indica (RF-328)', async () => {
    const { token, student } = await setupAdminAndStudent();
    await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 10, type: 'BONUS', reason: 'inicial', createdById: null },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: student.id }, data: { totalPoints: 10 } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/points/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, points: -50, type: 'PENALTY', reason: 'Penalización por incidente' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ newTotal: 0, truncated: true });
  });
});
