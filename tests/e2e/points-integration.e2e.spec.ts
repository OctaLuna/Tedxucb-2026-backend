import { test, expect } from '@playwright/test';
import { cleanAllTables } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';

async function loginAs(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/login', { data: { email, password: 'unaClaveSegura9' } });
  return (await response.json()).accessToken as string;
}

/**
 * Único flujo cruzado que ningún E2E individual cubre todavía:
 * points.e2e.spec.ts prueba ajuste->reversión pero nunca mira
 * /leaderboard; leaderboard.e2e.spec.ts prueba el ranking pero siembra
 * puntos por Prisma directo, no por el endpoint real de ajuste.
 */
test.describe('points + leaderboard: un ajuste administrativo real mueve el ranking', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('POST /points/adjustments cambia el orden de /leaderboard, y revertirlo lo devuelve', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-cruzado-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const { user: a } = await seedStudent({ email: `e2e-cruzado-a-${Date.now()}@ucb.edu.bo` });
    const { user: b } = await seedStudent({ email: `e2e-cruzado-b-${Date.now()}@ucb.edu.bo` });
    const adminToken = await loginAs(request, admin.email);
    const viewerToken = await loginAs(request, a.email);

    // B empieza arriba, A recibe un bono real y lo supera.
    await request.post('/api/v1/points/adjustments', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { studentId: b.id, points: 20, type: 'BONUS', reason: 'Bono inicial E2E' },
    });

    const beforeBoost = await request.get('/api/v1/leaderboard', { headers: { Authorization: `Bearer ${viewerToken}` } });
    expect((await beforeBoost.json()).data[0].studentId).toBe(b.id);

    const adjustment = await request.post('/api/v1/points/adjustments', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { studentId: a.id, points: 30, type: 'BONUS', reason: 'Bono que lo pone primero' },
    });
    expect(adjustment.status()).toBe(201);
    const transactionId = (await adjustment.json()).transactionId as string;

    const afterBoost = await request.get('/api/v1/leaderboard', { headers: { Authorization: `Bearer ${viewerToken}` } });
    const afterBoostBody = await afterBoost.json();
    expect(afterBoostBody.data[0].studentId).toBe(a.id);
    expect(afterBoostBody.data[1].studentId).toBe(b.id);

    const reversal = await request.post(`/api/v1/points/${transactionId}/reverse`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'Corrección E2E, vuelve al orden anterior' },
    });
    expect(reversal.status()).toBe(201);

    const afterReversal = await request.get('/api/v1/leaderboard', { headers: { Authorization: `Bearer ${viewerToken}` } });
    expect((await afterReversal.json()).data[0].studentId).toBe(b.id);
  });
});
