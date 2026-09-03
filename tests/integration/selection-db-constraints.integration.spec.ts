import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedStudent } from '../support/seed-catalog';
import { seedUser } from '../support/seed-user';
import { seedEvent } from '../support/seed-content';

/**
 * Prisma directo contra Postgres real, sin pasar por el servicio -- prueba
 * la garantía del motor, no la de la aplicación (Artículo IX).
 */
describe('Restricciones del motor -- selection_runs/selections (T033)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('rechaza directamente una segunda ejecución activa para el mismo evento (one_active_selection_run_per_event)', async () => {
    const event = await seedEvent({ status: 'PUBLISHED', studentCapacity: 10 });
    const admin = await seedUser({ email: 'admin-run-duplicado@ucb.edu.bo', roles: ['ADMIN'] });

    await prismaTestClient.selectionRun.create({
      data: { eventId: event.id, executedById: admin.id, studentCapacitySnapshot: 10 },
    });

    await expect(
      prismaTestClient.selectionRun.create({
        data: { eventId: event.id, executedById: admin.id, studentCapacitySnapshot: 10 },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una asignación manual sin motivo (manual_needs_reason)', async () => {
    const admin = await seedUser({ email: 'admin-sin-motivo@ucb.edu.bo', roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: 'alumno-sin-motivo-seleccion@ucb.edu.bo' });

    await expect(
      prismaTestClient.selection.create({
        data: { source: 'MANUAL', studentId: student.id, assignedById: admin.id, entryCode: 'codigo-1' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una selección RANKING sin run_id (ranking_has_run)', async () => {
    const { user: student } = await seedStudent({ email: 'alumno-ranking-sin-run@ucb.edu.bo' });

    await expect(
      prismaTestClient.selection.create({
        data: {
          source: 'RANKING',
          studentId: student.id,
          pointsAtSelection: 10,
          rankAtSelection: 1,
          entryCode: 'codigo-2',
        },
      }),
    ).rejects.toThrow();
  });

  it('rechaza dos selecciones vivas del mismo alumno (one_active_selection_per_student)', async () => {
    const admin = await seedUser({ email: 'admin-doble-seleccion@ucb.edu.bo', roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: 'alumno-doble-seleccion@ucb.edu.bo' });

    await prismaTestClient.selection.create({
      data: { source: 'MANUAL', studentId: student.id, assignedById: admin.id, reason: 'primera', entryCode: 'codigo-3' },
    });

    await expect(
      prismaTestClient.selection.create({
        data: { source: 'MANUAL', studentId: student.id, assignedById: admin.id, reason: 'segunda', entryCode: 'codigo-4' },
      }),
    ).rejects.toThrow();
  });

  it('permite dos selecciones del mismo alumno si la primera está revocada', async () => {
    const admin = await seedUser({ email: 'admin-reasignar@ucb.edu.bo', roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: 'alumno-reasignado@ucb.edu.bo' });

    await prismaTestClient.selection.create({
      data: {
        source: 'MANUAL',
        studentId: student.id,
        assignedById: admin.id,
        reason: 'primera',
        entryCode: 'codigo-5',
        revokedAt: new Date(),
        revokedById: admin.id,
        revokedReason: 'liberado',
      },
    });

    await expect(
      prismaTestClient.selection.create({
        data: { source: 'MANUAL', studentId: student.id, assignedById: admin.id, reason: 'segunda', entryCode: 'codigo-6' },
      }),
    ).resolves.toBeDefined();
  });
});
