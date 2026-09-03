import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('entries (contrato, RF-416 a RF-419, T016-T018)', () => {
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
  });

  async function loginAdmin() {
    const admin = await seedUser({ email: `admin-entradas-${Date.now()}-${Math.random()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    return { admin, token };
  }

  describe('GET /api/v1/me/entry', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/me/entry');
      expect(response.status).toBe(401);
    });

    it('selected: false para un alumno sin selección viva', async () => {
      const { user: student } = await seedStudent({ email: `sin-lugar-${Date.now()}@ucb.edu.bo` });
      const token = await loginAs(app, student.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/me/entry')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ selected: false });
    });

    it('devuelve el código de entrada de un alumno seleccionado', async () => {
      const { token: adminToken } = await loginAdmin();
      const { user: student } = await seedStudent({ email: `con-lugar-${Date.now()}@ucb.edu.bo` });
      const studentToken = await loginAs(app, student.email);
      await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: student.id, reason: 'motivo' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/me/entry')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ selected: true, used: false });
      expect(response.body.entryCode).toEqual(expect.any(String));
    });
  });

  describe('POST /api/v1/entries/scan', () => {
    async function setupSelectedStudent() {
      const { token: adminToken } = await loginAdmin();
      const staff = await seedUser({ email: `staff-scan-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const staffToken = await loginAs(app, staff.email);
      const { user: student } = await seedStudent({ email: `escaneado-${Date.now()}@ucb.edu.bo` });
      const created = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: student.id, reason: 'motivo' });
      return { staffToken, entryCode: created.body.entryCode as string, studentName: student.fullName };
    }

    it('rechaza con 404 INVALID_ENTRY un código inexistente', async () => {
      const staff = await seedUser({ email: `staff-scan-404-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const response = await request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${token}`)
        .send({ entryCode: 'codigo-que-no-existe' });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('INVALID_ENTRY');
    });

    it('un STAFF valida una entrada y autoriza el ingreso', async () => {
      const { staffToken, entryCode } = await setupSelectedStudent();
      const response = await request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ entryCode });
      expect(response.status).toBe(201);
      expect(response.body.enteredAt).toEqual(expect.any(String));
    });

    it('rechaza con 409 ALREADY_USED un segundo escaneo, con la hora del primero', async () => {
      const { staffToken, entryCode } = await setupSelectedStudent();
      await request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ entryCode });

      const response = await request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ entryCode });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('ALREADY_USED');
      expect(response.body.details.usedAt).toEqual(expect.any(String));
    });
  });

  describe('GET /api/v1/entries/live', () => {
    it('rechaza con 403 a un STAFF (solo ADMIN)', async () => {
      const staff = await seedUser({ email: `staff-live-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const response = await request(app.getHttpServer())
        .get('/api/v1/entries/live')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('refleja el aforo ocupado en tiempo real', async () => {
      const { token: adminToken } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 80 });
      const staff = await seedUser({ email: `staff-live2-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const staffToken = await loginAs(app, staff.email);
      const { user: student } = await seedStudent({ email: `ingresado-${Date.now()}@ucb.edu.bo` });
      const created = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: student.id, reason: 'motivo' });
      await request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ entryCode: created.body.entryCode });

      const response = await request(app.getHttpServer())
        .get('/api/v1/entries/live')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ totalCapacity: 100, entered: 1, studentCapacity: 80 });
    });
  });
});
