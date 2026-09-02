import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('GET /api/v1/me/points (contrato, RF-329, T014)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    qrTokenService = app.get(QrTokenService);
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

  it('rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/points');
    expect(response.status).toBe(401);
  });

  it('rechaza con 403 FORBIDDEN a un ADMIN sin rol ALUMNO', async () => {
    const admin = await seedUser({ email: `admin-historial-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer()).get('/api/v1/me/points').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('un abono por check-in aparece con activity y method; summary refleja el total y las actividades atendidas', async () => {
    const staff = await seedUser({ email: `staff-historial-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const activity = await seedActivity({ title: 'Taller de historial', pointsValue: 10 });
    await seedActivityStaff(activity.id, staff.id);
    const { user: student } = await seedStudent({ email: `alumno-historial-${Date.now()}@ucb.edu.bo` });
    const studentToken = await loginAs(app, student.email);

    await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(student.id).token });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      points: 10,
      type: 'ACTIVITY',
      activity: { id: activity.id, title: 'Taller de historial' },
      method: 'STAFF_SCAN',
    });
    expect(response.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(response.body.summary).toMatchObject({ totalPoints: 10, activitiesAttended: 1 });
  });

  it('pagina correctamente con ?page&limit', async () => {
    const admin = await seedUser({ email: `admin-paginacion-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: `alumno-paginacion-${Date.now()}@ucb.edu.bo` });
    const studentToken = await loginAs(app, student.email);

    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/points/adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: student.id, points: 5, type: 'BONUS', reason: `Bono ${i}` });
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/points?page=1&limit=2')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
});
