import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { closeTestDb, cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { closeRedisTestClient, cleanRateLimits } from '../support/redis-test-client';
import { seedEvent } from '../support/seed-content';
import { seedStudent } from '../support/seed-catalog';
import { seedUser } from '../support/seed-user';

describe('contrato de asistencia NFC de expositor', () => {
  let app: INestApplication;
  let eventId: string;
  let itemId: string;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  const base = () => `/api/v1/event-program/${itemId}`;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    const event = await seedEvent({ slug: 'innovation-week', name: 'BizWeek', status: 'PUBLISHED' });
    eventId = event.id;
    const admin = await seedUser({ email: 'exhibitor-admin@ucb.edu.bo', roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: 'exhibitor-student@ucb.edu.bo' });
    studentId = student.id;
    await prismaTestClient.eventEmailAccess.create({ data: { eventId, emailNormalized: student.email } });
    const item = await prismaTestClient.eventProgramItem.create({ data: {
      eventId,
      title: 'Innovación abierta',
      type: 'TALK',
      status: 'PUBLISHED',
      startsAt: new Date('2030-11-10T13:00:00Z'),
      endsAt: new Date('2030-11-10T14:00:00Z'),
    } });
    itemId = item.id;
    await prismaTestClient.activity.create({ data: {
      eventId,
      programItemId: itemId,
      title: item.title,
      pointsValue: 4,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      checkinOpensAt: item.startsAt,
      checkinClosesAt: item.endsAt,
      status: 'PUBLISHED',
      createdById: admin.id,
    } });
    const login = async (email: string) => (await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'unaClaveSegura9' })).body.accessToken as string;
    adminToken = await login(admin.email);
    studentToken = await login(student.email);
  });

  it('mantiene activos los enlaces normal y de expositor, y rota/revoca cada uno por separado', async () => {
    const normal = await request(app.getHttpServer()).post(`${base()}/attendance-link?eventSlug=innovation-week`)
      .set('Authorization', `Bearer ${adminToken}`).send().expect(201);
    const exhibitor = await request(app.getHttpServer()).post(`${base()}/attendance-link?eventSlug=innovation-week`)
      .set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EXHIBITOR' }).expect(201);

    expect(normal.body.data.kind).toBe('ATTENDANCE');
    expect(exhibitor.body.data.kind).toBe('EXHIBITOR');
    expect(exhibitor.body.data.token).not.toBe(normal.body.data.token);

    const adminList = await request(app.getHttpServer()).get(`${base()}/attendance?eventSlug=innovation-week`)
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(adminList.body.data.links).toMatchObject({
      attendance: { active: true },
      exhibitor: { active: true },
    });

    await request(app.getHttpServer()).delete(`${base()}/attendance-link?eventSlug=innovation-week&kind=EXHIBITOR`)
      .set('Authorization', `Bearer ${adminToken}`).expect(204);
    await request(app.getHttpServer()).post('/api/v1/me/program-attendance/preview')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitor.body.data.token }).expect(410);
    await request(app.getHttpServer()).post('/api/v1/me/program-attendance/preview')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: normal.body.data.token }).expect(201);
  });

  it('suma 15 puntos al puntaje base una sola vez cuando se confirma con enlace de expositor', async () => {
    const exhibitor = await request(app.getHttpServer()).post(`${base()}/attendance-link?eventSlug=innovation-week`)
      .set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EXHIBITOR' }).expect(201);

    const preview = await request(app.getHttpServer()).post('/api/v1/me/program-attendance/preview')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitor.body.data.token }).expect(201);
    expect(preview.body.data).toMatchObject({ kind: 'EXHIBITOR', bonusPoints: 15, bonusAlreadyAwarded: false });

    const first = await request(app.getHttpServer()).put('/api/v1/me/program-attendance')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitor.body.data.token }).expect(200);
    expect(first.body.data).toMatchObject({ alreadyConfirmed: false, pointsAwarded: 4, bonusPointsAwarded: 15, newTotal: 19 });

    const retry = await request(app.getHttpServer()).put('/api/v1/me/program-attendance')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitor.body.data.token }).expect(200);
    expect(retry.body.data).toMatchObject({ alreadyConfirmed: true, bonusPointsAwarded: 0, newTotal: 19 });

    const movements = await prismaTestClient.pointTransaction.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } });
    expect(movements.map(({ type, points }) => ({ type, points }))).toEqual([
      { type: 'ACTIVITY', points: 4 },
      { type: 'BONUS', points: 15 },
    ]);
    expect(await prismaTestClient.programAttendance.count({ where: { userId: studentId, programItemId: itemId } })).toBe(1);
    expect((await prismaTestClient.eventStudentPoints.findUniqueOrThrow({ where: { eventId_studentId: { eventId, studentId } } })).totalPoints).toBe(19);
  });

  it('añade el bono al registro normal ya existente y neutraliza confirmaciones simultáneas', async () => {
    const [normal, exhibitor] = await Promise.all([
      request(app.getHttpServer()).post(`${base()}/attendance-link?eventSlug=innovation-week`).set('Authorization', `Bearer ${adminToken}`).send(),
      request(app.getHttpServer()).post(`${base()}/attendance-link?eventSlug=innovation-week`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EXHIBITOR' }),
    ]);
    const normalToken = normal.body.data.token as string;
    const exhibitorToken = exhibitor.body.data.token as string;
    expect(normal.status).toBe(201);
    expect(exhibitor.status).toBe(201);

    const regular = await request(app.getHttpServer()).put('/api/v1/me/program-attendance')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: normalToken }).expect(200);
    expect(regular.body.data).toMatchObject({ alreadyConfirmed: false, pointsAwarded: 4, newTotal: 4 });

    const bonus = await request(app.getHttpServer()).put('/api/v1/me/program-attendance')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitorToken }).expect(200);
    expect(bonus.body.data).toMatchObject({ alreadyConfirmed: true, bonusPointsAwarded: 15, newTotal: 19 });

    await Promise.all(Array.from({ length: 3 }, () => request(app.getHttpServer())
      .put('/api/v1/me/program-attendance')
      .set('Authorization', `Bearer ${studentToken}`).send({ token: exhibitorToken }).expect(200)));

    expect(await prismaTestClient.programAttendance.count({ where: { userId: studentId, programItemId: itemId } })).toBe(1);
    expect(await prismaTestClient.pointTransaction.count({ where: { studentId, type: 'BONUS', idempotencyKey: { startsWith: 'program-attendance-exhibitor:' } } })).toBe(1);
    expect((await prismaTestClient.eventStudentPoints.findUniqueOrThrow({ where: { eventId_studentId: { eventId, studentId } } })).totalPoints).toBe(19);
  });
});
