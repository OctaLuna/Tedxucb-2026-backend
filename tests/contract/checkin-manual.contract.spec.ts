import { seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Check-in manual (contrato, RF-319, T012)', () => {
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

  async function setupStaffAndActivity() {
    const staff = await seedUser({ email: `staff-manual-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);
    const activity = await seedActivity({ createdById: staff.id, pointsValue: 10 });
    await seedActivityStaff(activity.id, staff.id);
    return { staff, token, activity };
  }

  it('rechaza sin justificación (manual_requires_note)', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-manual-sin-nota@ucb.edu.bo' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, note: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('con justificación, registra la asistencia como MANUAL y otorga los puntos', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-manual-con-nota@ucb.edu.bo' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: student.id, note: 'Se quedó sin batería; verificado con su carnet.' });

    expect(response.status).toBe(201);
    expect(response.body.pointsAwarded).toBe(10);

    const attendance = await prismaTestClient.attendance.findFirstOrThrow({
      where: { activityId: activity.id, studentId: student.id },
    });
    expect(attendance.method).toBe('MANUAL');
    expect(attendance.note).toBe('Se quedó sin batería; verificado con su carnet.');
  });
});
