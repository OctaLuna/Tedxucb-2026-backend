import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { expiredQrToken } from '../support/qr-token-fixture';

function activityPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title: 'Taller E2E de Sostenibilidad',
    pointsValue: 15,
    startsAt: new Date(now - 30 * 60_000).toISOString(),
    endsAt: new Date(now + 90 * 60_000).toISOString(),
    checkinOpensAt: new Date(now - 15 * 60_000).toISOString(),
    checkinClosesAt: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

test.describe('activities: ciclo de check-in y motor de puntos (T086)', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('crear, publicar, asignar staff, emitir QR y hacer check-in otorga los puntos', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-activities-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const staff = await seedUser({ email: `e2e-staff-activities-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const { user: student } = await seedStudent({ email: `e2e-alumno-activities-${Date.now()}@ucb.edu.bo` });

    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: adminToken } = await adminLogin.json();
    const staffLogin = await request.post('/api/v1/auth/login', {
      data: { email: staff.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: staffToken } = await staffLogin.json();
    const studentLogin = await request.post('/api/v1/auth/login', {
      data: { email: student.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: studentToken } = await studentLogin.json();

    const created = await request.post('/api/v1/activities', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: activityPayload(),
    });
    expect(created.status()).toBe(201);
    const activity = await created.json();
    expect(activity.status).toBe('DRAFT');

    const published = await request.patch(`/api/v1/activities/${activity.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'PUBLISHED' },
    });
    expect(published.status()).toBe(200);

    const assigned = await request.post(`/api/v1/activities/${activity.id}/staff`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { userId: staff.id },
    });
    expect(assigned.status()).toBe(200);

    const qr = await request.get('/api/v1/me/qr', { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(qr.status()).toBe(200);
    const { token: qrToken } = await qr.json();

    const checkin = await request.post(`/api/v1/activities/${activity.id}/checkin`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { qrToken },
    });
    expect(checkin.status()).toBe(201);
    const checkinBody = await checkin.json();
    expect(checkinBody.pointsAwarded).toBe(15);
    expect(checkinBody.newTotal).toBe(15);

    // GET /me/points es responsabilidad de 003-b (todavía no existe) --
    // el motor de puntos ya otorgó el punto, se verifica directo en la
    // caché derivada (Artículo IV: siempre debe coincidir con el ledger).
    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(15);
  });

  test('rechaza con 401 EXPIRED_QR_TOKEN un token QR vencido', async ({ request }) => {
    const staff = await seedUser({ email: `e2e-staff-vencido-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const admin = await seedUser({ email: `e2e-admin-vencido-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const { user: student } = await seedStudent({ email: `e2e-alumno-vencido-${Date.now()}@ucb.edu.bo` });

    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: adminToken } = await adminLogin.json();
    const staffLogin = await request.post('/api/v1/auth/login', {
      data: { email: staff.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: staffToken } = await staffLogin.json();

    const created = await request.post('/api/v1/activities', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: activityPayload(),
    });
    const activity = await created.json();
    await request.patch(`/api/v1/activities/${activity.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'PUBLISHED' },
    });
    await request.post(`/api/v1/activities/${activity.id}/staff`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { userId: staff.id },
    });

    const checkin = await request.post(`/api/v1/activities/${activity.id}/checkin`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { qrToken: expiredQrToken(student.id) },
    });
    expect(checkin.status()).toBe(401);
    expect((await checkin.json()).error).toBe('EXPIRED_QR_TOKEN');
  });

  test('rechaza con 403 STAFF_NOT_ASSIGNED a un STAFF sin asignación a la actividad', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-sinasignar-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const staff = await seedUser({ email: `e2e-staff-sinasignar-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const { user: student } = await seedStudent({ email: `e2e-alumno-sinasignar-${Date.now()}@ucb.edu.bo` });

    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: adminToken } = await adminLogin.json();
    const staffLogin = await request.post('/api/v1/auth/login', {
      data: { email: staff.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: staffToken } = await staffLogin.json();
    const studentLogin = await request.post('/api/v1/auth/login', {
      data: { email: student.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: studentToken } = await studentLogin.json();

    const created = await request.post('/api/v1/activities', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: activityPayload(),
    });
    const activity = await created.json();
    await request.patch(`/api/v1/activities/${activity.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'PUBLISHED' },
    });
    // Deliberadamente sin asignar staff a esta actividad.

    const qr = await request.get('/api/v1/me/qr', { headers: { Authorization: `Bearer ${studentToken}` } });
    const { token: qrToken } = await qr.json();

    const checkin = await request.post(`/api/v1/activities/${activity.id}/checkin`, {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { qrToken },
    });
    expect(checkin.status()).toBe(403);
    expect((await checkin.json()).error).toBe('STAFF_NOT_ASSIGNED');
  });
});
