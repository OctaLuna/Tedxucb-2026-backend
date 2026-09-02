import { test, expect } from '@playwright/test';
import { cleanAllTables } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';

test.describe('points: ajuste manual, historial y reversión (T086 de 003-b, ciclo del prompt)', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('ajuste manual -> historial lo refleja -> reversión -> historial vuelve a mostrar ambos y el saldo correcto', async ({
    request,
  }) => {
    const admin = await seedUser({ email: `e2e-admin-points-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: `e2e-alumno-points-${Date.now()}@ucb.edu.bo` });

    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: adminToken } = await adminLogin.json();
    const studentLogin = await request.post('/api/v1/auth/login', {
      data: { email: student.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: studentToken } = await studentLogin.json();

    const adjustment = await request.post('/api/v1/points/adjustments', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { studentId: student.id, points: 20, type: 'BONUS', reason: 'Coordinación del taller E2E' },
    });
    expect(adjustment.status()).toBe(201);
    const { transactionId, newTotal } = await adjustment.json();
    expect(newTotal).toBe(20);

    const afterBonus = await request.get('/api/v1/me/points', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const afterBonusBody = await afterBonus.json();
    expect(afterBonusBody.summary.totalPoints).toBe(20);
    expect(afterBonusBody.data).toHaveLength(1);

    const reversal = await request.post(`/api/v1/points/${transactionId}/reverse`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'Corrección: bono otorgado por error' },
    });
    expect(reversal.status()).toBe(201);
    const reversalBody = await reversal.json();
    expect(reversalBody.newTotal).toBe(0);

    const afterReversal = await request.get('/api/v1/me/points', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const afterReversalBody = await afterReversal.json();
    expect(afterReversalBody.summary.totalPoints).toBe(0);
    expect(afterReversalBody.data).toHaveLength(2);
    const types = afterReversalBody.data.map((row: { type: string }) => row.type).sort();
    expect(types).toEqual(['BONUS', 'REVERSAL']);
  });
});
