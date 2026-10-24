import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';
import { seedEvent } from '../support/seed-content';
import { grantEventAccess } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

function activityPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title: 'Taller de integración cruzada',
    pointsValue: 10,
    startsAt: new Date(now - 30 * 60_000).toISOString(),
    endsAt: new Date(now + 90 * 60_000).toISOString(),
    checkinOpensAt: new Date(now - 15 * 60_000).toISOString(),
    checkinClosesAt: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

/**
 * Grupo 7 de tasks.md: pruebas que solo tienen sentido con los tres
 * módulos juntos (activities + points + leaderboard), por eso se escriben
 * en 003-d y no antes. T081 (concurrencia) y T082 (idempotencia) ya están
 * cubiertas por checkin-concurrency/checkin-idempotency.integration.spec.ts
 * (003-a) -- no se repiten acá.
 */
describe('Motor de puntos -- integración cruzada de los tres módulos (Grupo 7)', () => {
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
    await seedEvent();
  });

  it('T080 -- ciclo completo: crear, publicar, asignar staff, escanear, y el punto se ve en /me/points, /leaderboard y /me/progress', async () => {
    const admin = await seedUser({ email: `admin-flujo-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staff = await seedUser({ email: `staff-flujo-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    await grantEventAccess(staff.email);
    const staffToken = await loginAs(app, staff.email);
    const { user: student } = await seedStudent({ email: `alumno-flujo-${Date.now()}@ucb.edu.bo` });
    const studentToken = await loginAs(app, student.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(activityPayload({ pointsValue: 12 }));
    expect(created.status).toBe(201);
    const activityId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activityId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED' });

    await request(app.getHttpServer())
      .post(`/api/v1/activities/${activityId}/staff`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: staff.id });

    const checkin = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activityId}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(student.id).token });
    expect(checkin.status).toBe(201);
    expect(checkin.body.pointsAwarded).toBe(12);

    const history = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ type: 'ACTIVITY', points: 12, activity: { id: activityId } });
    expect(history.body.summary).toMatchObject({ totalPoints: 12, activitiesAttended: 1 });

    const leaderboard = await request(app.getHttpServer())
      .get('/api/v1/leaderboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(leaderboard.body.data[0]).toMatchObject({ studentId: student.id, totalPoints: 12, position: 1 });

    const progress = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(progress.body).toEqual({ totalPoints: 12, rank: 1, totalStudents: 1 });
  });

  it('T083 -- una reversión administrativa se ve enlazada en /me/points y baja al alumno en /leaderboard y /me/progress', async () => {
    const admin = await seedUser({ email: `admin-reversion-cruzada-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staff = await seedUser({ email: `staff-reversion-cruzada-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const activity = await seedActivity({ pointsValue: 20 });
    await seedActivityStaff(activity.id, staff.id);
    const { user: reverted } = await seedStudent({ email: `alumno-revertido-${Date.now()}@ucb.edu.bo` });
    const revertedToken = await loginAs(app, reverted.email);
    const { user: leader } = await seedStudent({ email: `alumno-lider-${Date.now()}@ucb.edu.bo` });

    // El líder queda con más puntos que el revertido incluso antes de
    // revertir, para que el descenso post-reversión sea inequívoco en el
    // ranking (y no una simple redistribución de posiciones ambigua).
    await prismaTestClient.pointTransaction.create({
      data: { studentId: leader.id, points: 25, type: 'BONUS', reason: 'seed' },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: leader.id }, data: { totalPoints: 25 } });

    const checkin = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(reverted.id).token });
    expect(checkin.status).toBe(201);
    const { id: transactionId } = await prismaTestClient.pointTransaction.findFirstOrThrow({
      where: { studentId: reverted.id },
    });

    const preLeaderboard = await request(app.getHttpServer())
      .get('/api/v1/leaderboard')
      .set('Authorization', `Bearer ${revertedToken}`);
    expect(preLeaderboard.body.data.find((row: { studentId: string }) => row.studentId === reverted.id)).toMatchObject(
      { totalPoints: 20 },
    );

    const reversal = await request(app.getHttpServer())
      .post(`/api/v1/points/${transactionId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Registro duplicado, corregido en integración cruzada' });
    expect(reversal.status).toBe(201);

    const history = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${revertedToken}`);
    const ids = history.body.data.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([transactionId, reversal.body.transactionId]));

    const postLeaderboard = await request(app.getHttpServer())
      .get('/api/v1/leaderboard')
      .set('Authorization', `Bearer ${revertedToken}`);
    // El ranking no filtra por puntaje mínimo, solo excluye a
    // deshabilitados (RF-340) -- sigue apareciendo, ahora en 0 puntos y
    // detrás del líder.
    const revertedRow = postLeaderboard.body.data.find((row: { studentId: string }) => row.studentId === reverted.id);
    expect(revertedRow).toMatchObject({ totalPoints: 0, position: 2 });
    expect(postLeaderboard.body.data[0]).toMatchObject({ studentId: leader.id, totalPoints: 25 });

    const progress = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${revertedToken}`);
    expect(progress.body.totalPoints).toBe(0);
  });

  it('T084 (RF-306) -- cambiar el valor de una actividad no recalcula lo ya otorgado', async () => {
    const admin = await seedUser({ email: `admin-rf306-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staff = await seedUser({ email: `staff-rf306-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const activity = await seedActivity({ pointsValue: 10 });
    await seedActivityStaff(activity.id, staff.id);
    const { user: studentA } = await seedStudent({ email: `alumno-a-rf306-${Date.now()}@ucb.edu.bo` });
    const tokenA = await loginAs(app, studentA.email);
    const { user: studentB } = await seedStudent({ email: `alumno-b-rf306-${Date.now()}@ucb.edu.bo` });
    const tokenB = await loginAs(app, studentB.email);

    const checkinA = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(studentA.id).token });
    expect(checkinA.body.pointsAwarded).toBe(10);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/activities/${activity.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pointsValue: 25 });
    expect(patched.body.pointsValue).toBe(25);

    const checkinB = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(studentB.id).token });
    expect(checkinB.body.pointsAwarded).toBe(25);

    const historyA = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(historyA.body.data[0].points).toBe(10);
    expect(historyA.body.summary.totalPoints).toBe(10);

    const historyB = await request(app.getHttpServer())
      .get('/api/v1/me/points')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(historyB.body.data[0].points).toBe(25);
  });
});
