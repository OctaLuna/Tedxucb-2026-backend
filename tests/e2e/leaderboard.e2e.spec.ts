import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';

async function loginAs(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/login', { data: { email, password: 'unaClaveSegura9' } });
  return (await response.json()).accessToken as string;
}

async function grantPoints(studentId: string, points: number) {
  await prismaTestClient.pointTransaction.create({ data: { studentId, points, type: 'BONUS', reason: 'seed e2e' } });
  await prismaTestClient.studentProfile.update({ where: { userId: studentId }, data: { totalPoints: points } });
}

test.describe('leaderboard: ranking, progreso y exportación', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('el ranking refleja el orden real y excluye a un alumno deshabilitado', async ({ request }) => {
    const { user: leader } = await seedStudent({ email: `e2e-lider-${Date.now()}@ucb.edu.bo` });
    const { user: runnerUp } = await seedStudent({ email: `e2e-segundo-${Date.now()}@ucb.edu.bo` });
    const { user: disabled } = await seedStudent({
      email: `e2e-deshabilitado-${Date.now()}@ucb.edu.bo`,
      status: 'DISABLED',
    });
    await grantPoints(leader.id, 80);
    await grantPoints(runnerUp.id, 40);

    const token = await loginAs(request, leader.email);
    const response = await request.get('/api/v1/leaderboard', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.data.map((row: { studentId: string }) => row.studentId)).toEqual([leader.id, runnerUp.id]);
    expect(body.data.map((row: { studentId: string }) => row.studentId)).not.toContain(disabled.id);

    const progress = await request.get('/api/v1/me/progress', { headers: { Authorization: `Bearer ${token}` } });
    expect(progress.status()).toBe(200);
    expect(await progress.json()).toEqual({ totalPoints: 80, rank: 1, totalStudents: 2 });
  });

  test('un ADMIN exporta el ranking en CSV', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-export-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: `e2e-exportado-${Date.now()}@ucb.edu.bo` });
    await grantPoints(student.id, 25);

    const token = await loginAs(request, admin.email);
    const response = await request.get('/api/v1/leaderboard/export', { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    const body = await response.text();
    expect(body).toContain('"Posición","Código","Nombre","Carrera","Facultad","Puntos"');
  });
});
