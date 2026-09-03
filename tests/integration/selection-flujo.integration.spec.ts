import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
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

async function grantPoints(studentId: string, points: number) {
  await prismaTestClient.pointTransaction.create({ data: { studentId, points, type: 'BONUS', reason: 'seed' } });
  await prismaTestClient.studentProfile.update({ where: { userId: studentId }, data: { totalPoints: points } });
}

/**
 * T062 y T064: no cubiertas por las pruebas de contrato de "revert" y
 * "revoke" (esas solo verifican el efecto inmediato). T060 (ciclo
 * completo) y T065 (distribución) ya están cubiertas por
 * selection.contract.spec.ts contra Postgres real -- no se duplican acá
 * (skill pruebas).
 */
describe('selection -- integración de flujo (T062, T064)', () => {
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

  it('T062 -- revertir y volver a ejecutar produce una nueva selección; la anterior sigue visible y auditada como revertida', async () => {
    const admin = await seedUser({ email: `admin-t062-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 1 });
    const { user: student } = await seedStudent({ email: `t062-alumno-${Date.now()}@ucb.edu.bo` });
    await grantPoints(student.id, 50);

    const firstExecution = await request(app.getHttpServer())
      .post('/api/v1/selection/execute')
      .set('Authorization', `Bearer ${token}`);
    expect(firstExecution.status).toBe(201);
    const firstRunId = firstExecution.body.runId as string;

    await request(app.getHttpServer())
      .post('/api/v1/selection/revert')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Aforo confirmado más grande, se necesita re-ejecutar.' });

    const secondExecution = await request(app.getHttpServer())
      .post('/api/v1/selection/execute')
      .set('Authorization', `Bearer ${token}`);
    expect(secondExecution.status).toBe(201);
    expect(secondExecution.body.runId).not.toBe(firstRunId);

    // Trazabilidad: la ejecución original sigue en la base, marcada
    // revertida -- nunca se borró (Artículo IV en espíritu).
    const firstRun = await prismaTestClient.selectionRun.findUniqueOrThrow({ where: { id: firstRunId } });
    expect(firstRun.revertedAt).not.toBeNull();
    expect(firstRun.revertReason).toContain('Aforo confirmado');

    const audit = await prismaTestClient.auditLog.findFirst({
      where: { action: 'SELECTION_REVERTED', entityId: firstRunId },
    });
    expect(audit).not.toBeNull();

    // La nueva ejecución seleccionó de nuevo al mismo alumno (sigue siendo
    // el mejor posicionado), con un registro de selección propio.
    const activeSelections = await prismaTestClient.selection.count({ where: { revokedAt: null } });
    expect(activeSelections).toBe(1);
  });

  it('T064 -- cubrir a mano un lugar liberado tras revocar una selección individual', async () => {
    const admin = await seedUser({ email: `admin-t064-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: original } = await seedStudent({ email: `t064-original-${Date.now()}@ucb.edu.bo` });
    const { user: replacement } = await seedStudent({ email: `t064-reemplazo-${Date.now()}@ucb.edu.bo` });

    const created = await request(app.getHttpServer())
      .post('/api/v1/selection/manual')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: original.id, reason: 'Asignación inicial' });
    expect(created.status).toBe(201);

    const revoked = await request(app.getHttpServer())
      .post(`/api/v1/selection/${created.body.id}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'El alumno avisó que no podrá asistir.' });
    expect(revoked.status).toBe(200);

    const filled = await request(app.getHttpServer())
      .post('/api/v1/selection/manual')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId: replacement.id, reason: 'Cubre el lugar liberado por el alumno anterior.' });
    expect(filled.status).toBe(201);

    const active = await prismaTestClient.selection.findMany({ where: { revokedAt: null } });
    expect(active).toHaveLength(1);
    expect(active[0].studentId).toBe(replacement.id);

    // El original sigue en la base, visible como revocado -- no se borró.
    const originalRow = await prismaTestClient.selection.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(originalRow.revokedAt).not.toBeNull();
  });
});
