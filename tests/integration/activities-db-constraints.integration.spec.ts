import { prismaTestClient, cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { seedActivity } from '../support/seed-activities';
import { seedStudent } from '../support/seed-catalog';

describe('Restricciones del motor — activities/attendances/point_transactions (T037)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('rechaza directamente un doble check-in por el índice único parcial', async () => {
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'doble-checkin@ucb.edu.bo' });

    await prismaTestClient.attendance.create({
      data: { activityId: activity.id, studentId: student.id, method: 'STAFF_SCAN' },
    });

    await expect(
      prismaTestClient.attendance.create({
        data: { activityId: activity.id, studentId: student.id, method: 'STAFF_SCAN' },
      }),
    ).rejects.toThrow();
  });

  it('con multipleAllowed=true, una segunda asistencia del mismo alumno sí se inserta', async () => {
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'multiple-ok@ucb.edu.bo' });

    await prismaTestClient.attendance.create({
      data: { activityId: activity.id, studentId: student.id, method: 'STAFF_SCAN', multipleAllowed: true },
    });

    await expect(
      prismaTestClient.attendance.create({
        data: { activityId: activity.id, studentId: student.id, method: 'STAFF_SCAN', multipleAllowed: true },
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza un registro MANUAL sin nota (manual_requires_note)', async () => {
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'manual-sin-nota@ucb.edu.bo' });

    await expect(
      prismaTestClient.attendance.create({
        data: { activityId: activity.id, studentId: student.id, method: 'MANUAL', note: '   ' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza directamente un UPDATE sobre el libro mayor (Artículo IV)', async () => {
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'ledger-update@ucb.edu.bo' });
    const transaction = await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 10, type: 'ACTIVITY', activityId: activity.id },
    });

    await expect(
      prismaTestClient.pointTransaction.update({ where: { id: transaction.id }, data: { points: 20 } }),
    ).rejects.toThrow();
  });

  it('rechaza directamente un DELETE sobre el libro mayor (Artículo IV)', async () => {
    const activity = await seedActivity();
    const { user: student } = await seedStudent({ email: 'ledger-delete@ucb.edu.bo' });
    const transaction = await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 10, type: 'ACTIVITY', activityId: activity.id },
    });

    await expect(prismaTestClient.pointTransaction.delete({ where: { id: transaction.id } })).rejects.toThrow();
  });

  it('rechaza un movimiento manual sin motivo (manual_types_need_reason)', async () => {
    const { user: student } = await seedStudent({ email: 'sin-motivo@ucb.edu.bo' });

    await expect(
      prismaTestClient.pointTransaction.create({ data: { studentId: student.id, points: 15, type: 'BONUS' } }),
    ).rejects.toThrow();
  });

  it('rechaza un movimiento de cero puntos (non_zero)', async () => {
    const { user: student } = await seedStudent({ email: 'cero-puntos@ucb.edu.bo' });

    await expect(
      prismaTestClient.pointTransaction.create({
        data: { studentId: student.id, points: 0, type: 'BONUS', reason: 'motivo' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza un total_points negativo en la caché (total_points_non_negative)', async () => {
    const { user: student } = await seedStudent({ email: 'total-negativo@ucb.edu.bo' });

    await expect(
      prismaTestClient.studentProfile.update({ where: { userId: student.id }, data: { totalPoints: -1 } }),
    ).rejects.toThrow();
  });
});
