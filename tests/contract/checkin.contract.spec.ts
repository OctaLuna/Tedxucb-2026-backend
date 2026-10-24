import { seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { expiredQrToken, tamperedQrToken } from '../support/qr-token-fixture';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Check-in de participación (contrato, RF-305 RF-311 a RF-321)', () => {
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

  async function setupStaffAndActivity(overrides: Parameters<typeof seedActivity>[0] = {}) {
    const staff = await seedUser({ email: `staff-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);
    const activity = await seedActivity({ createdById: staff.id, ...overrides });
    await seedActivityStaff(activity.id, staff.id);
    return { staff, token, activity };
  }

  it('ciclo feliz: registra la asistencia, otorga los puntos y responde con nombre/foto/total', async () => {
    const { token, activity } = await setupStaffAndActivity({ pointsValue: 10 });
    const { user: student } = await seedStudent({ email: 'alumno-checkin@ucb.edu.bo', fullName: 'María Quispe' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      pointsAwarded: 10,
      newTotal: 10,
      student: { fullName: 'María Quispe' },
      activity: { id: activity.id },
    });
    expect(response.body.attendanceId).toBeTruthy();

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(10);
  });

  it('rechaza con 400 INVALID_QR_TOKEN un token con firma inválida', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-tampered@ucb.edu.bo' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: tamperedQrToken(student.id) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_QR_TOKEN');
  });

  it('rechaza con 401 EXPIRED_QR_TOKEN un token vencido', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-vencido@ucb.edu.bo' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: expiredQrToken(student.id) });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('EXPIRED_QR_TOKEN');
    expect(response.body.details.expiredAt).toBeTruthy();
  });

  it('rechaza con 403 STAFF_NOT_ASSIGNED a un staff no asignado a la actividad', async () => {
    const other = await seedUser({ email: `staff-otro-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const token = await loginAs(app, other.email);
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'alumno-sin-staff@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('STAFF_NOT_ASSIGNED');
  });

  it('rechaza con 403 STUDENT_NOT_VERIFIED a un alumno con cuenta pendiente (RF-122)', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-pendiente@ucb.edu.bo', status: 'PENDING' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('STUDENT_NOT_VERIFIED');
  });

  it('rechaza con 409 CHECKIN_WINDOW_CLOSED fuera de la ventana de registro', async () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { token, activity } = await setupStaffAndActivity({
      checkinOpensAt: new Date(past.getTime() - 60 * 60 * 1000),
      checkinClosesAt: past,
    });
    const { user: student } = await seedStudent({ email: 'alumno-fuera-ventana@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('CHECKIN_WINDOW_CLOSED');
    expect(response.body.details.opensAt).toBeTruthy();
  });

  it('rechaza con 409 CHECKIN_WINDOW_CLOSED una actividad no publicada', async () => {
    const { token, activity } = await setupStaffAndActivity({ status: 'DRAFT' });
    const { user: student } = await seedStudent({ email: 'alumno-borrador@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('CHECKIN_WINDOW_CLOSED');
  });

  it('rechaza con 409 ALREADY_CHECKED_IN un segundo escaneo, con hora y validador previos', async () => {
    const { token, activity } = await setupStaffAndActivity();
    const { user: student } = await seedStudent({ email: 'alumno-duplicado@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken });
    expect(first.status).toBe(201);

    const { token: qrToken2 } = qrTokenService.issue(student.id);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: qrToken2 });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('ALREADY_CHECKED_IN');
    expect(second.body.details.checkedInAt).toBeTruthy();
    expect(second.body.details.pointsAwarded).toBe(activity.pointsValue);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(activity.pointsValue);
  });

  it('con allowMultipleCheckins=true, un segundo escaneo del mismo alumno sí prospera', async () => {
    const { token, activity } = await setupStaffAndActivity({ allowMultipleCheckins: true, pointsValue: 5 });
    const { user: student } = await seedStudent({ email: 'alumno-multiple@ucb.edu.bo' });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: qrTokenService.issue(student.id).token });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qrToken: qrTokenService.issue(student.id).token });
    expect(second.status).toBe(201);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(10);
  });
});
