import type { Prisma } from '@prisma/client';
import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedStudent } from '../support/seed-catalog';

/**
 * Prisma directo contra Postgres real, sin pasar por el servicio -- prueba
 * la garantía del motor, no la de la aplicación (Artículo IX).
 */
describe('Restricciones del motor — point_transactions (T037, parte de points)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  /**
   * La prueba de idempotencia no negociable de este módulo: no hay
   * "reintento de red" para un ajuste administrativo como en el check-in,
   * pero sí hay un doble-envío equivalente -- revertir el mismo movimiento
   * dos veces. Lo que impide el segundo abono inverso es la restricción
   * única sobre reverses_id, no la lógica de PointsAdjustmentsService.
   */
  it('rechaza directamente una segunda reversión del mismo movimiento (point_transactions_reverses_id_key)', async () => {
    const { user: student } = await seedStudent({ email: 'doble-reversion-motor@ucb.edu.bo' });
    const original = await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 10, type: 'BONUS', reason: 'motivo' },
    });

    await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: -10, type: 'REVERSAL', reversesId: original.id, reason: 'primera' },
    });

    await expect(
      prismaTestClient.pointTransaction.create({
        data: { studentId: student.id, points: -10, type: 'REVERSAL', reversesId: original.id, reason: 'segunda' },
      }),
    ).rejects.toThrow();
  });

  // manual_types_need_reason con BONUS ya se probó en 003-a
  // (activities-db-constraints.integration.spec.ts) -- acá se cubren los
  // tres tipos restantes que crea específicamente este módulo, tal como
  // pide el prompt de 003-b, no por asumir que faltaba cobertura del CHECK.
  it.each(['PENALTY', 'ADJUSTMENT', 'REVERSAL'] as const)(
    'rechaza un movimiento %s sin motivo (manual_types_need_reason)',
    async (type) => {
      const { user: student } = await seedStudent({ email: `sin-motivo-${type.toLowerCase()}@ucb.edu.bo` });

      const data: Prisma.PointTransactionUncheckedCreateInput = { studentId: student.id, points: -5, type };
      if (type === 'REVERSAL') {
        const original = await prismaTestClient.pointTransaction.create({
          data: { studentId: student.id, points: 5, type: 'BONUS', reason: 'motivo original' },
        });
        data.reversesId = original.id;
      }

      await expect(prismaTestClient.pointTransaction.create({ data })).rejects.toThrow();
    },
  );
});
