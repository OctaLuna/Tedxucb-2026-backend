import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../../src/common/mail/mail.service';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';
import { grantEventAccess } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

async function seedStudentWithEventAccess(email: string) {
  const result = await seedStudent({ email });
  await grantEventAccess(result.user.email);
  return result;
}
async function grantPoints(studentId: string, points: number) {
  await prismaTestClient.pointTransaction.create({ data: { studentId, points, type: 'BONUS', reason: 'seed' } });
  await prismaTestClient.studentProfile.update({ where: { userId: studentId }, data: { totalPoints: points } });
}

describe('selection (contrato, RF-402 a RF-423 tras ADR-009, T010-T015)', () => {
  let app: INestApplication;
  let enqueueSelectionNotification: jest.SpyInstance;

  beforeAll(async () => {
    enqueueSelectionNotification = jest
      .spyOn(MailService.prototype, 'enqueueSelectionNotification')
      .mockResolvedValue(undefined);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    enqueueSelectionNotification.mockRestore();
    await closeRedisTestClient();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    await seedEvent();
  });

  async function loginAdmin() {
    const admin = await seedUser({ email: `admin-seleccion-${Date.now()}-${Math.random()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    return { admin, token };
  }

  describe('POST /api/v1/selection/execute', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/selection/execute');
      expect(response.status).toBe(401);
    });

    it('rechaza con 403 a un STAFF', async () => {
      const staff = await seedUser({ email: `staff-execute-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('rechaza con 422 CAPACITY_NOT_CONFIGURED si el evento no tiene studentCapacity', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('CAPACITY_NOT_CONFIGURED');
    });

    it('selecciona a los mejores posicionados hasta agotar studentCapacity, excluye deshabilitados', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 2 });
      const { user: top } = await seedStudent({ email: `top-seleccion-${Date.now()}@ucb.edu.bo` });
      const { user: second } = await seedStudent({ email: `segundo-seleccion-${Date.now()}@ucb.edu.bo` });
      const { user: third } = await seedStudent({ email: `tercero-seleccion-${Date.now()}@ucb.edu.bo` });
      const { user: disabled } = await seedStudent({
        email: `deshabilitado-seleccion-${Date.now()}@ucb.edu.bo`,
        status: 'DISABLED',
      });
      await grantPoints(top.id, 100);
      await grantPoints(second.id, 50);
      await grantPoints(third.id, 10);
      await grantPoints(disabled.id, 200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ studentCapacity: 2, selectedCount: 2 });

      const selections = await prismaTestClient.selection.findMany({ where: { revokedAt: null } });
      const selectedIds = selections.map((s) => s.studentId);
      expect(selectedIds.sort()).toEqual([top.id, second.id].sort());
      expect(selectedIds).not.toContain(third.id);
      expect(selectedIds).not.toContain(disabled.id);
    });

    it('rechaza con 409 SELECTION_ALREADY_ACTIVE una segunda ejecución sin revertir', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 1 });
      const { user: student } = await seedStudent({ email: `unico-seleccion-${Date.now()}@ucb.edu.bo` });
      await grantPoints(student.id, 10);

      const first = await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('SELECTION_ALREADY_ACTIVE');
    });
  });

  describe('POST /api/v1/selection/revert', () => {
    it('rechaza con 400 REASON_REQUIRED sin motivo', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 1 });

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/revert')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('REASON_REQUIRED');
    });

    it('rechaza con 404 NOT_FOUND sin ejecución activa', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 1 });

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/revert')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'motivo' });
      expect(response.status).toBe(404);
    });

    it('revierte la ejecución activa y marca sus selecciones', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 1 });
      const { user: student } = await seedStudent({ email: `revertir-seleccion-${Date.now()}@ucb.edu.bo` });
      await grantPoints(student.id, 10);
      await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/revert')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Aforo mal configurado' });

      expect(response.status).toBe(200);
      expect(response.body.revokedCount).toBe(1);

      const selection = await prismaTestClient.selection.findFirstOrThrow({ where: { studentId: student.id } });
      expect(selection.revokedAt).not.toBeNull();
    });
  });

  describe('GET /api/v1/selection', () => {
    it('rechaza con 404 sin ejecución activa', async () => {
      const { token } = await loginAdmin();
      const response = await request(app.getHttpServer())
        .get('/api/v1/selection')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    it('devuelve el resultado con distribución por carrera (RF-407a)', async () => {
      const { token } = await loginAdmin();
      await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 2 });
      const { user: a } = await seedStudent({ email: `dist-a-${Date.now()}@ucb.edu.bo` });
      const { user: b } = await seedStudent({ email: `dist-b-${Date.now()}@ucb.edu.bo` });
      await grantPoints(a.id, 90);
      await grantPoints(b.id, 80);
      await request(app.getHttpServer())
        .post('/api/v1/selection/execute')
        .set('Authorization', `Bearer ${token}`);

      const response = await request(app.getHttpServer())
        .get('/api/v1/selection')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({ studentId: a.id, pointsAtSelection: 90, rankAtSelection: 1 });
      expect(response.body.distribution.reduce((sum: number, d: { count: number }) => sum + d.count, 0)).toBe(2);
    });
  });

  describe('POST /api/v1/selection/manual', () => {
    it('rechaza con 400 REASON_REQUIRED sin motivo', async () => {
      const { token } = await loginAdmin();
      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Jorge Salazar', email: 'jorge@ejemplo.com' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('REASON_REQUIRED');
    });

    it('rechaza con 400 CONTACT_REQUIRED sin studentId ni fullName/email', async () => {
      const { token } = await loginAdmin();
      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Invitado especial' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('CONTACT_REQUIRED');
    });

    it('asigna un lugar a una persona externa por nombre/correo', async () => {
      const { token } = await loginAdmin();
      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Jorge Salazar',
          email: 'jorge.salazar@ejemplo.com',
          audienceType: 'Docente',
          reason: 'Invitado por la Facultad de Ciencias Jurídicas',
        });
      expect(response.status).toBe(201);
      expect(response.body.audienceType).toBe('Docente');
    });

    it('rechaza con 409 ALREADY_SELECTED si el alumno ya tiene una selección activa', async () => {
      const { token } = await loginAdmin();
      const { user: student } = await seedStudentWithEventAccess(`ya-seleccionado-${Date.now()}@ucb.edu.bo`);
      await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: student.id, reason: 'Primera asignación' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: student.id, reason: 'Segundo intento' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('ALREADY_SELECTED');
    });
  });

  describe('POST /api/v1/selection/:id/revoke', () => {
    it('libera el lugar de un seleccionado sin afectar a los demás', async () => {
      const { token } = await loginAdmin();
      const { user: a } = await seedStudentWithEventAccess(`revocar-a-${Date.now()}@ucb.edu.bo`);
      const { user: b } = await seedStudentWithEventAccess(`revocar-b-${Date.now()}@ucb.edu.bo`);
      const selectionA = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: a.id, reason: 'A' });
      await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: b.id, reason: 'B' });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/selection/${selectionA.body.id}/revoke`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'El alumno avisó que no podrá asistir.' });

      expect(response.status).toBe(200);

      const stillActive = await prismaTestClient.selection.count({ where: { revokedAt: null } });
      expect(stillActive).toBe(1);
    });

    it('rechaza con 409 ALREADY_REVOKED un lugar ya liberado', async () => {
      const { token } = await loginAdmin();
      const { user: student } = await seedStudentWithEventAccess(`doble-revoke-${Date.now()}@ucb.edu.bo`);
      const created = await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: student.id, reason: 'inicial' });
      await request(app.getHttpServer())
        .post(`/api/v1/selection/${created.body.id}/revoke`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'primera revocación' });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/selection/${created.body.id}/revoke`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'segunda revocación' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('ALREADY_REVOKED');
    });
  });

  describe('GET /api/v1/selection/export', () => {
    it('un ADMIN exporta CSV con encabezados', async () => {
      const { token } = await loginAdmin();
      const { user: student } = await seedStudentWithEventAccess(`exportar-seleccion-${Date.now()}@ucb.edu.bo`);
      await request(app.getHttpServer())
        .post('/api/v1/selection/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: student.id, reason: 'motivo' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/selection/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('"Nombre","Correo","Tipo","Carrera","Entrada usada"');
    });
  });
});
