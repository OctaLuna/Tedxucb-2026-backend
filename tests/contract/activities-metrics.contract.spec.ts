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

describe('GET /api/v1/activities/metrics (contrato, T093, CE-304)', () => {
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

  it('rechaza con 403 a un STAFF (solo ADMIN)', async () => {
    const staff = await seedUser({ email: `staff-metricas-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/activities/metrics')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('calcula manualRatio sobre check-ins reales, y "metrics" no se confunde con :id (ParseUUIDPipe)', async () => {
    const admin = await seedUser({ email: `admin-metricas-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staff = await seedUser({ email: `staff-metricas2-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const activity = await seedActivity({ pointsValue: 5 });
    await seedActivityStaff(activity.id, staff.id);

    const { user: scanned } = await seedStudent({ email: `alumno-escaneado-${Date.now()}@ucb.edu.bo` });
    await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(scanned.id).token });

    const { user: manual } = await seedStudent({ email: `alumno-manual-metricas-${Date.now()}@ucb.edu.bo` });
    await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin/manual`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ studentId: manual.id, note: 'Sin batería, verificado con carnet.' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/activities/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalCheckins: 2, manualCheckins: 1, manualRatio: 0.5 });
  });
});
