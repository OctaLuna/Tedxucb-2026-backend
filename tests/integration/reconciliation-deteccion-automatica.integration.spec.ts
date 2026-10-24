import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { ReconciliationService } from '../../src/modules/points/reconciliation.service';
import { seedEvent } from '../support/seed-content';

/**
 * T086: automatiza lo que 003-b solo verificó a mano (el propio prompt de
 * 003-b lo pedía así explícitamente, dejando esta versión para acá).
 * Altera total_points directo por Prisma -- el único modo de producir una
 * discrepancia real, ya que todo camino de la aplicación pasa por
 * LedgerService.
 */
describe('Reconciliación -- detección y corrección automatizada (T086, RF-332 RF-333)', () => {
  let app: INestApplication;
  let reconciliation: ReconciliationService;

  beforeAll(async () => {
    app = await createTestApp();
    reconciliation = app.get(ReconciliationService);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await seedEvent();
  });

  it('checkAll() detecta una caché alterada a mano, y fixStudent() la corrige dejando constancia en auditoría', async () => {
    const admin = await seedUser({ email: `admin-reconciliacion-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: `alumno-reconciliacion-${Date.now()}@ucb.edu.bo` });

    await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 15, type: 'BONUS', reason: 'seed real' },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: student.id }, data: { totalPoints: 15 } });

    // La desincronización: se altera la caché a mano, saltándose el
    // ledger por completo -- exactamente lo que RF-324 dice que nunca
    // debería divergir.
    await prismaTestClient.studentProfile.update({ where: { userId: student.id }, data: { totalPoints: 999 } });

    const before = await reconciliation.checkStudent(student.id);
    expect(before.consistent).toBe(false);
    expect(before.cachedTotal).toBe(999);
    expect(before.ledgerSum).toBe(15);

    const discrepancies = await reconciliation.checkAll();
    expect(discrepancies.map((d) => d.studentId)).toContain(student.id);

    const fixed = await reconciliation.fixStudent(student.id, admin.id);
    expect(fixed.consistent).toBe(true);
    expect(fixed.cachedTotal).toBe(15);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(15);

    const audit = await prismaTestClient.auditLog.findFirst({
      where: { action: 'RECONCILIATION_FIX_APPLIED', entityId: student.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(admin.id);
    expect(audit?.detail).toMatchObject({ before: 999, after: 15 });

    // Tras corregir, una segunda vuelta no encuentra nada que corregir.
    const afterFix = await reconciliation.checkAll();
    expect(afterFix.map((d) => d.studentId)).not.toContain(student.id);
  });
});
