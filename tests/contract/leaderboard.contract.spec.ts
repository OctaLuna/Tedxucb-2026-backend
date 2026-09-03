import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedCareer, seedStudent } from '../support/seed-catalog';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

async function grantPoints(studentId: string, points: number) {
  await prismaTestClient.pointTransaction.create({ data: { studentId, points, type: 'BONUS', reason: 'seed' } });
  await prismaTestClient.studentProfile.update({ where: { userId: studentId }, data: { totalPoints: points } });
}

describe('leaderboard (contrato, RF-338 a RF-342, T018)', () => {
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

  describe('GET /api/v1/leaderboard', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/leaderboard');
      expect(response.status).toBe(401);
    });

    it('un ALUMNO ve el ranking completo, ordenado por puntaje descendente (RF-342)', async () => {
      const { user: top } = await seedStudent({ email: `top-ranking-${Date.now()}@ucb.edu.bo` });
      const { user: bottom } = await seedStudent({ email: `bottom-ranking-${Date.now()}@ucb.edu.bo` });
      await grantPoints(top.id, 100);
      await grantPoints(bottom.id, 10);
      const viewerToken = await loginAs(app, top.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboard')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({ position: 1, studentId: top.id, totalPoints: 100 });
      expect(response.body.data[1]).toMatchObject({ position: 2, studentId: bottom.id, totalPoints: 10 });
      expect(response.body.meta.totalStudents).toBe(2);
      expect(response.body.meta.generatedAt).toEqual(expect.any(String));
    });

    it('excluye a un alumno deshabilitado (RF-340)', async () => {
      const { user: active } = await seedStudent({ email: `activo-ranking-${Date.now()}@ucb.edu.bo` });
      const { user: disabled } = await seedStudent({
        email: `deshabilitado-ranking-${Date.now()}@ucb.edu.bo`,
        status: 'DISABLED',
      });
      await grantPoints(active.id, 10);
      const token = await loginAs(app, active.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboard')
        .set('Authorization', `Bearer ${token}`);

      const ids = response.body.data.map((row: { studentId: string }) => row.studentId);
      expect(ids).not.toContain(disabled.id);
    });

    it('filtra por career (RF-341)', async () => {
      const { career: derecho } = await seedCareer({ careerName: `Derecho ${Date.now()}` });
      const { career: otra } = await seedCareer({ careerName: `Otra ${Date.now()}` });
      const { user: enDerecho } = await seedStudent({
        email: `alumno-derecho-${Date.now()}@ucb.edu.bo`,
        careerId: derecho.id,
      });
      const { user: enOtra } = await seedStudent({ email: `alumno-otra-${Date.now()}@ucb.edu.bo`, careerId: otra.id });
      await grantPoints(enDerecho.id, 5);
      await grantPoints(enOtra.id, 5);
      const token = await loginAs(app, enDerecho.email);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/leaderboard?career=${derecho.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].studentId).toBe(enDerecho.id);
      expect(response.body.meta.totalStudents).toBe(1);
    });

    it('un career/faculty que no existe devuelve data vacío, no un error', async () => {
      const { user: student } = await seedStudent({ email: `alumno-sin-match-${Date.now()}@ucb.edu.bo` });
      const token = await loginAs(app, student.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboard?career=3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/leaderboard/export (rol ADMIN)', () => {
    it('rechaza con 403 a un ALUMNO', async () => {
      const { user: student } = await seedStudent({ email: `alumno-export-${Date.now()}@ucb.edu.bo` });
      const token = await loginAs(app, student.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboard/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('un ADMIN exporta CSV con encabezados y queda auditado', async () => {
      const admin = await seedUser({ email: `admin-export-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const { user: student, studentProfile } = await seedStudent({
        email: `alumno-exportado-${Date.now()}@ucb.edu.bo`,
      });
      await grantPoints(student.id, 20);

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboard/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('"Posición","Código","Nombre","Carrera","Facultad","Puntos"');
      expect(response.text).toContain(studentProfile.studentCode);

      const audit = await prismaTestClient.auditLog.findFirst({ where: { action: 'LEADERBOARD_EXPORTED' } });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(admin.id);
    });
  });
});
