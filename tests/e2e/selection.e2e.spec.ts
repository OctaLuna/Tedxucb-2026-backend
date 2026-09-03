import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';

async function loginAs(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/login', { data: { email, password: 'unaClaveSegura9' } });
  return (await response.json()).accessToken as string;
}

/**
 * Sin paso de confirmación (no existe, ADR-009): ejecutar la selección →
 * el alumno consulta /me/entry → su entrada se valida en la puerta una
 * vez → un segundo intento de la misma entrada es rechazado.
 */
test.describe('selection: ejecución, consulta de entrada y control de acceso', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('ciclo completo: seleccionado por ranking, consulta su entrada, ingresa, segundo escaneo rechazado', async ({
    request,
  }) => {
    const admin = await seedUser({ email: `e2e-admin-seleccion-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const staff = await seedUser({ email: `e2e-staff-seleccion-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const { user: student } = await seedStudent({ email: `e2e-alumno-seleccion-${Date.now()}@ucb.edu.bo` });
    await prismaTestClient.pointTransaction.create({
      data: { studentId: student.id, points: 60, type: 'BONUS', reason: 'seed e2e' },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: student.id }, data: { totalPoints: 60 } });
    await seedEvent({ status: 'PUBLISHED', capacity: 100, studentCapacity: 80 });

    const adminToken = await loginAs(request, admin.email);
    const staffToken = await loginAs(request, staff.email);
    const studentToken = await loginAs(request, student.email);

    const execute = await request.post('/api/v1/selection/execute', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(execute.status()).toBe(201);
    expect((await execute.json()).selectedCount).toBe(1);

    const myEntry = await request.get('/api/v1/me/entry', { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(myEntry.status()).toBe(200);
    const entryBody = await myEntry.json();
    expect(entryBody.selected).toBe(true);
    expect(entryBody.used).toBe(false);

    const scan = await request.post('/api/v1/entries/scan', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { entryCode: entryBody.entryCode },
    });
    expect(scan.status()).toBe(201);

    const secondScan = await request.post('/api/v1/entries/scan', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { entryCode: entryBody.entryCode },
    });
    expect(secondScan.status()).toBe(409);
    expect((await secondScan.json()).error).toBe('ALREADY_USED');

    const live = await request.get('/api/v1/entries/live', { headers: { Authorization: `Bearer ${adminToken}` } });
    expect((await live.json())).toMatchObject({ entered: 1, studentsEntered: 1 });
  });
});
