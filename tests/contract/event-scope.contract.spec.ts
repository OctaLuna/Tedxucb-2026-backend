import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { grantEventAccess, seedTestEvent } from '../support/seed-events';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';
import { ReconciliationService } from '../../src/modules/points/reconciliation.service';

describe('autorización por evento (contrato RF-512)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => {
    await app.close();
    await closeTestDb();
    await closeRedisTestClient();
  });
  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    await seedTestEvent('tedxucb');
    await seedTestEvent('innovation-week');
  });

  async function tokenFor(email: string) {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'unaClaveSegura9' });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  it('limita una identidad externa al único evento incluido en su whitelist', async () => {
    const user = await seedUser({ email: 'externo@ejemplo.com' });
    await grantEventAccess(user.email, 'tedxucb');
    const token = await tokenFor(user.email);

    await request(app.getHttpServer()).get('/api/v1/activities?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).expect(200);
    const denied = await request(app.getHttpServer()).get('/api/v1/activities?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${token}`).expect(403);
    expect(denied.body.error).toBe('EVENT_ACCESS_DENIED');
  });

  it('aplica scope al rol ADMIN y resuelve el permiso de eventos por UUID', async () => {
    const admin = await seedUser({ email: 'admin-scoped@ejemplo.com', roles: ['ADMIN'] });
    const tedx = await prismaEvent('tedxucb');
    const innovation = await prismaEvent('innovation-week');
    await grantEventAccess(admin.email, 'tedxucb');
    await revokeEventAccess(admin.email, innovation.id);
    const token = await tokenFor(admin.email);

    await request(app.getHttpServer()).get(`/api/v1/events/${tedx.id}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const listed = await request(app.getHttpServer()).get('/api/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.map((event: { id: string }) => event.id)).toEqual([tedx.id]);
    const denied = await request(app.getHttpServer()).get(`/api/v1/events/${innovation.id}`)
      .set('Authorization', `Bearer ${token}`).expect(403);
    expect(denied.body.error).toBe('EVENT_ACCESS_DENIED');
  });

  it('mantiene públicos los perfiles publicados del evento', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/speakers?eventSlug=innovation-week').expect(200);
  });

  it('separa historial, ranking y entradas de la misma persona entre eventos', async () => {
    const tedx = await prismaEvent('tedxucb');
    const innovation = await prismaEvent('innovation-week');
    const { user: student } = await seedStudent({ email: 'alumna-event-scoped@ucb.edu.bo' });
    await grantEventAccess(student.email, 'tedxucb');
    await grantEventAccess(student.email, 'innovation-week');
    const studentToken = await tokenFor(student.email);
    const admin = await seedUser({ email: 'admin-event-scoped@ucb.edu.bo', roles: ['ADMIN'] });
    const adminToken = await tokenFor(admin.email);

    await request(app.getHttpServer()).post('/api/v1/points/adjustments?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student.id, points: 12, type: 'BONUS', reason: 'TEDx' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/points/adjustments?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student.id, points: 34, type: 'BONUS', reason: 'Semana' }).expect(201);

    const tedxHistory = await request(app.getHttpServer()).get('/api/v1/me/points?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${studentToken}`).expect(200);
    const innovationHistory = await request(app.getHttpServer()).get('/api/v1/me/points?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${studentToken}`).expect(200);
    expect(tedxHistory.body).toMatchObject({ data: [{ points: 12 }], summary: { totalPoints: 12 } });
    expect(innovationHistory.body).toMatchObject({ data: [{ points: 34 }], summary: { totalPoints: 34 } });

    const tedxRanking = await request(app.getHttpServer()).get('/api/v1/leaderboard?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${studentToken}`).expect(200);
    const innovationRanking = await request(app.getHttpServer()).get('/api/v1/leaderboard?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${studentToken}`).expect(200);
    expect(tedxRanking.body.data[0].totalPoints).toBe(12);
    expect(innovationRanking.body.data[0].totalPoints).toBe(34);

    await prismaTestClient.eventStudentPoints.update({
      where: { eventId_studentId: { eventId: innovation.id, studentId: student.id } },
      data: { totalPoints: 999 },
    });
    const reconciliation = app.get(ReconciliationService);
    expect(await reconciliation.checkEventProjection(student.id)).toEqual([
      { eventId: innovation.id, studentId: student.id, cachedTotal: 999, ledgerTotal: 34 },
    ]);
    await reconciliation.fixEventProjection(student.id, admin.id);
    expect(await reconciliation.checkEventProjection(student.id)).toEqual([]);

    await request(app.getHttpServer()).post('/api/v1/selection/manual?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${adminToken}`).send({ studentId: student.id, reason: 'TEDx' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/selection/manual?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${adminToken}`).send({ studentId: student.id, reason: 'Semana' }).expect(201);
    await request(app.getHttpServer()).get('/api/v1/me/entry?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${studentToken}`).expect(200).expect(({ body }) => expect(body.selected).toBe(true));
    await request(app.getHttpServer()).get('/api/v1/me/entry?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${studentToken}`).expect(200).expect(({ body }) => expect(body.selected).toBe(true));
  });

  it('impide dar puntos o selección en un evento sin acceso explícito', async () => {
    const { user: student } = await seedStudent({ email: 'externo-solo-innovation@example.com' });
    await grantEventAccess(student.email, 'innovation-week');
    const admin = await seedUser({ email: 'admin-target-scope@example.com', roles: ['ADMIN'] });
    const adminToken = await tokenFor(admin.email);

    const adjustment = await request(app.getHttpServer()).post('/api/v1/points/adjustments?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student.id, points: 10, type: 'BONUS', reason: 'No debe cruzar de evento' })
      .expect(403);
    expect(adjustment.body.error).toBe('EVENT_ACCESS_DENIED');

    const selection = await request(app.getHttpServer()).post('/api/v1/selection/manual?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student.id, reason: 'No debe cruzar de evento' })
      .expect(403);
    expect(selection.body.error).toBe('EVENT_ACCESS_DENIED');

    expect(await prismaTestClient.pointTransaction.count({ where: { studentId: student.id } })).toBe(0);
    expect(await prismaTestClient.selection.count({ where: { studentId: student.id } })).toBe(0);
  });
  it('rechaza check-in cuando el alumno no tiene acceso al evento de la actividad', async () => {
    const staff = await seedUser({ email: 'staff-event-scope@ejemplo.com', roles: ['STAFF'] });
    await grantEventAccess(staff.email, 'innovation-week');
    const staffToken = await tokenFor(staff.email);
    const admin = await seedUser({ email: 'admin-checkin-scope@ejemplo.com', roles: ['ADMIN'] });
    const activity = await seedActivity({ eventSlug: 'innovation-week', createdById: admin.id });
    await seedActivityStaff(activity.id, staff.id);
    const { user: student } = await seedStudent({ email: 'student-event-scope@example.com' });
    await grantEventAccess(student.email, 'tedxucb');
    const qr = app.get(QrTokenService).issue(student.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qr.token });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('EVENT_ACCESS_DENIED');
  });
});

async function prismaEvent(slug: string) {
  return prismaTestClient.event.findUniqueOrThrow({ where: { slug } });
}

async function revokeEventAccess(email: string, eventId: string) {
  await prismaTestClient.eventEmailAccess.updateMany({
    where: { emailNormalized: email, eventId },
    data: { revokedAt: new Date() },
  });
}
