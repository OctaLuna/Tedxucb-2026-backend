import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent, seedCareer } from '../support/seed-catalog';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

test.describe('profiles: perfil propio, avatar, listado de monitoreo', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('perfil propio, avatar inválido sin alterar el existente (Historia 2, escenario 3)', async ({
    request,
  }) => {
    const { user } = await seedStudent({ email: 'e2e-perfil@ucb.edu.bo', fullName: 'Perfil E2E' });
    const login = await request.post('/api/v1/auth/login', {
      data: { email: user.email, password: 'unaClaveSegura9' },
    });
    const { accessToken } = await login.json();

    const profile = await request.get('/api/v1/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(profile.status()).toBe(200);
    expect((await profile.json()).fullName).toBe('Perfil E2E');

    const validUpload = await request.post('/api/v1/me/avatar', {
      headers: { Authorization: `Bearer ${accessToken}` },
      multipart: { file: { name: 'avatar.png', mimeType: 'image/png', buffer: MINIMAL_VALID_PNG } },
    });
    expect(validUpload.status()).toBe(200);
    const originalUrl = (await validUpload.json()).avatarUrl as string;

    const invalidUpload = await request.post('/api/v1/me/avatar', {
      headers: { Authorization: `Bearer ${accessToken}` },
      multipart: {
        file: { name: 'malicioso.png', mimeType: 'image/png', buffer: Buffer.from('no es una imagen') },
      },
    });
    expect(invalidUpload.status()).toBe(422);

    const afterInvalid = await request.get('/api/v1/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect((await afterInvalid.json()).avatarUrl).toBe(originalUrl);
  });

  test('listado de monitoreo con filtro y 403 de STAFF (Historia 3)', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const staff = await seedUser({ email: `e2e-staff-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const { career } = await seedCareer({ careerName: `Carrera E2E ${Date.now()}` });
    await seedStudent({ email: `e2e-alumno-${Date.now()}@ucb.edu.bo`, fullName: 'Alumno Filtrado', careerId: career.id });

    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: adminToken } = await adminLogin.json();

    const filtered = await request.get(`/api/v1/students?career=${career.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(filtered.status()).toBe(200);
    const filteredBody = await filtered.json();
    expect(filteredBody.data).toHaveLength(1);
    expect(filteredBody.data[0].fullName).toBe('Alumno Filtrado');

    const staffLogin = await request.post('/api/v1/auth/login', {
      data: { email: staff.email, password: 'unaClaveSegura9' },
    });
    const { accessToken: staffToken } = await staffLogin.json();

    const forbidden = await request.get('/api/v1/students', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(forbidden.status()).toBe(403);
  });
});
