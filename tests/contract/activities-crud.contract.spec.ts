import { seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
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

function validActivityPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title: 'Taller de Economía Circular',
    pointsValue: 10,
    startsAt: new Date(now + 3600_000).toISOString(),
    endsAt: new Date(now + 7200_000).toISOString(),
    checkinOpensAt: new Date(now + 3000_000).toISOString(),
    checkinClosesAt: new Date(now + 6600_000).toISOString(),
    ...overrides,
  };
}

describe('CRUD de actividades (contrato, RF-301 a RF-310c)', () => {
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

  describe('GET /api/v1/public/activities', () => {
    it('exposes only published activities for the requested event without a session', async () => {
      const tedx = await seedActivity({ title: 'TEDx session', status: 'PUBLISHED' });
      const week = await seedActivity({ title: 'Innovation panel', status: 'PUBLISHED', eventSlug: 'innovation-week' });
      await seedActivity({ title: 'Draft session', status: 'DRAFT', eventSlug: 'innovation-week' });

      const response = await request(app.getHttpServer()).get('/api/v1/public/activities?eventSlug=innovation-week');
      expect(response.status).toBe(200);
      expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([week.id]);
      expect(response.body.data.map((row: { id: string }) => row.id)).not.toContain(tedx.id);
    });
  });

  describe('GET /api/v1/activities', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/activities');
      expect(response.status).toBe(401);
    });

    it('un ALUMNO solo ve actividades PUBLISHED, aunque pida otro status', async () => {
      const { user: student } = await seedStudent({ email: 'alumno-catalogo@ucb.edu.bo' });
      const token = await loginAs(app, student.email);
      await seedActivity({ title: 'Publicada', status: 'PUBLISHED' });
      await seedActivity({ title: 'Borrador', status: 'DRAFT' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/activities?status=DRAFT')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('PUBLISHED');
    });

    it('separa actividades por evento', async () => {
      const { user: student } = await seedStudent({ email: 'alumno-eventos@ucb.edu.bo' });
      const token = await loginAs(app, student.email);
      const tedx = await seedActivity({ title: 'TEDx session', status: 'PUBLISHED' });
      const week = await seedActivity({ title: 'Innovation panel', status: 'PUBLISHED', eventSlug: 'innovation-week' });

      const response = await request(app.getHttpServer()).get('/api/v1/activities?eventSlug=innovation-week')
        .set('Authorization', `Bearer ${token}`);
      expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([week.id]);
      expect(response.body.data.map((row: { id: string }) => row.id)).not.toContain(tedx.id);
    });

    it('un ADMIN ve todas, y puede filtrar por status', async () => {
      const admin = await seedUser({ email: 'admin-catalogo@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedActivity({ title: 'Publicada', status: 'PUBLISHED' });
      await seedActivity({ title: 'Borrador', status: 'DRAFT' });

      const all = await request(app.getHttpServer()).get('/api/v1/activities').set('Authorization', `Bearer ${token}`);
      expect(all.body.meta.total).toBe(2);

      const drafts = await request(app.getHttpServer())
        .get('/api/v1/activities?status=DRAFT')
        .set('Authorization', `Bearer ${token}`);
      expect(drafts.body.data).toHaveLength(1);
      expect(drafts.body.data[0].status).toBe('DRAFT');
    });
  });

  describe('GET /api/v1/activities/:id', () => {
    it('un ALUMNO recibe 404 al pedir una actividad DRAFT (no revela que existe)', async () => {
      const { user: student } = await seedStudent({ email: 'alumno-detalle@ucb.edu.bo' });
      const token = await loginAs(app, student.email);
      const draft = await seedActivity({ status: 'DRAFT' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/activities/${draft.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/activities', () => {
    it('un STAFF no puede crear actividades', async () => {
      const staff = await seedUser({ email: 'staff-crear@ucb.edu.bo', roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(validActivityPayload());

      expect(response.status).toBe(403);
    });

    it('ADMIN crea una actividad en DRAFT (RF-303)', async () => {
      const admin = await seedUser({ email: 'admin-crear@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(validActivityPayload());

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('DRAFT');
    });

    it('rechaza con 400 VALIDATION_ERROR pointsValue <= 0 (RF-302)', async () => {
      const admin = await seedUser({ email: 'admin-crear2@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(validActivityPayload({ pointsValue: 0 }));

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/activities/:id -- máquina de estados', () => {
    it('DRAFT -> PUBLISHED -> CLOSED es válido; CLOSED -> PUBLISHED es 409', async () => {
      const admin = await seedUser({ email: 'admin-transiciones@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const activity = await seedActivity({ status: 'DRAFT' });

      const published = await request(app.getHttpServer())
        .patch(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(published.status).toBe(200);

      const closed = await request(app.getHttpServer())
        .patch(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CLOSED' });
      expect(closed.status).toBe(200);

      const reopened = await request(app.getHttpServer())
        .patch(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(reopened.status).toBe(409);
      expect(reopened.body.error).toBe('INVALID_STATUS_TRANSITION');
    });

    it('cambiar pointsValue no recalcula lo ya otorgado (RF-306)', async () => {
      const admin = await seedUser({ email: 'admin-valor@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const activity = await seedActivity({ pointsValue: 10, status: 'PUBLISHED' });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ pointsValue: 20 });

      expect(response.status).toBe(200);
      expect(response.body.pointsValue).toBe(20);
    });
  });

  describe('POST /api/v1/activities/:id/cancel (RF-307 RF-308)', () => {
    it('cancela sin revertir por default explícito en false', async () => {
      const admin = await seedUser({ email: 'admin-cancelar@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const activity = await seedActivity({ status: 'PUBLISHED' });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ revertPoints: false });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'CANCELLED', reversedCount: 0 });
    });

    it('con revertPoints=true, revierte en bloque los puntos ya otorgados', async () => {
      const admin = await seedUser({ email: 'admin-cancelar-revertir@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const staff = await seedUser({ email: 'staff-cancelar@ucb.edu.bo', roles: ['STAFF'] });
      const staffToken = await loginAs(app, staff.email);
      const activity = await seedActivity({ status: 'PUBLISHED', pointsValue: 10 });
      await seedActivityStaff(activity.id, staff.id);
      const { user: student } = await seedStudent({ email: 'alumno-actividad-cancelada@ucb.edu.bo' });

      await request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/checkin`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ qrToken: qrTokenService.issue(student.id).token });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ revertPoints: true });

      expect(response.status).toBe(200);
      expect(response.body.reversedCount).toBe(1);

      const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
      expect(profile.totalPoints).toBe(0);

      const transactions = await prismaTestClient.pointTransaction.findMany({ where: { studentId: student.id } });
      expect(transactions).toHaveLength(2);
      expect(transactions.map((t) => t.type).sort()).toEqual(['ACTIVITY', 'REVERSAL']);
    });

    it('rechaza con 409 cancelar una actividad ya cancelada', async () => {
      const admin = await seedUser({ email: 'admin-doble-cancelar@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const activity = await seedActivity({ status: 'CANCELLED' });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ revertPoints: false });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('DELETE /api/v1/activities/:id (RF-307)', () => {
    it('elimina una actividad sin asistencias', async () => {
      const admin = await seedUser({ email: 'admin-eliminar@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const activity = await seedActivity();

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
    });

    it('rechaza con 409 ACTIVITY_HAS_ATTENDANCES eliminar una con asistencias', async () => {
      const admin = await seedUser({ email: 'admin-eliminar2@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const staff = await seedUser({ email: 'staff-eliminar@ucb.edu.bo', roles: ['STAFF'] });
      const staffToken = await loginAs(app, staff.email);
      const activity = await seedActivity({ status: 'PUBLISHED' });
      await seedActivityStaff(activity.id, staff.id);
      const { user: student } = await seedStudent({ email: 'alumno-no-eliminar@ucb.edu.bo' });

      await request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/checkin`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ qrToken: qrTokenService.issue(student.id).token });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/activities/${activity.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('ACTIVITY_HAS_ATTENDANCES');
    });
  });
});
