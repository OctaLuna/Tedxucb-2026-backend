import { seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { grantEventAccess } from '../support/seed-events';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Asignación de staff a actividades (contrato, RF-304 RF-305, Artículo V)', () => {
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
    await seedTestEvent();
  });

  it('ADMIN asigna un STAFF a una actividad', async () => {
    const admin = await seedUser({ email: 'admin-asignar@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const staff = await seedUser({ email: 'staff-asignado@ucb.edu.bo', roles: ['STAFF'] });
    await grantEventAccess(staff.email);
    const activity = await seedActivity();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/staff`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: staff.id });

    expect(response.status).toBe(200);
    const assignment = await prismaTestClient.activityStaff.findUnique({
      where: { activityId_userId: { activityId: activity.id, userId: staff.id } },
    });
    expect(assignment).not.toBeNull();
  });

  it('rechaza con 422 INVALID_STAFF_ROLE asignar a un ALUMNO', async () => {
    const admin = await seedUser({ email: 'admin-asignar2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: student } = await seedStudent({ email: 'alumno-no-staff@ucb.edu.bo' });
    const activity = await seedActivity();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/staff`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: student.id });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_STAFF_ROLE');
  });

  it('DELETE retira la asignación', async () => {
    const admin = await seedUser({ email: 'admin-retirar@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const staff = await seedUser({ email: 'staff-a-retirar@ucb.edu.bo', roles: ['STAFF'] });
    await grantEventAccess(staff.email);
    const activity = await seedActivity();
    await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/staff`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: staff.id });

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/activities/${activity.id}/staff/${staff.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(204);
    const assignment = await prismaTestClient.activityStaff.findUnique({
      where: { activityId_userId: { activityId: activity.id, userId: staff.id } },
    });
    expect(assignment).toBeNull();
  });

  it('ActivityStaffGuard rechaza incluso a un ADMIN no asignado (Artículo V: sin acceso global)', async () => {
    const admin = await seedUser({ email: 'admin-sin-asignar@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'alumno-guard@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('STAFF_NOT_ASSIGNED');
  });

  it('bloquea el check-in si se revocó el acceso al evento aunque siga asignado a la actividad', async () => {
    const staff = await seedUser({ email: 'staff-revocado@example.test', roles: ['STAFF'] });
    await grantEventAccess(staff.email);
    const token = await loginAs(app, staff.email);
    const activity = await seedActivity();
    await seedActivityStaff(activity.id, staff.id);
    const event = await prismaTestClient.event.findUniqueOrThrow({ where: { slug: 'tedxucb' } });
    await prismaTestClient.eventEmailAccess.updateMany({
      where: { emailNormalized: staff.email, eventId: event.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const { user: student } = await seedStudent({ email: 'student-checkin-revoked@example.test' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('EVENT_ACCESS_DENIED');
  });
});
