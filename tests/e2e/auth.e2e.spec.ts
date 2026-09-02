import { test, expect } from '@playwright/test';
import { cleanAuthTables } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

/**
 * Historia 1 (auto-registro) no es de este módulo — auth solo cubre
 * autenticación con un usuario ya activo, sembrado directo por Prisma
 * (POST /auth/register no existe todavía, es de 001-c).
 */
test.describe('auth: login, /me, refresh y logout de punta a punta', () => {
  test.beforeEach(async () => {
    await cleanAuthTables();
    await cleanRateLimits();
  });

  test('ciclo completo de sesión', async ({ request }) => {
    await seedUser({
      email: 'e2e@ucb.edu.bo',
      password: 'unaClaveSegura9',
      fullName: 'Alumno E2E',
      roles: ['ALUMNO'],
    });

    const loginFail = await request.post('/api/v1/auth/login', {
      data: { email: 'e2e@ucb.edu.bo', password: 'clave-incorrecta' },
    });
    expect(loginFail.status()).toBe(401);
    expect((await loginFail.json()).error).toBe('INVALID_CREDENTIALS');

    const login = await request.post('/api/v1/auth/login', {
      data: { email: 'e2e@ucb.edu.bo', password: 'unaClaveSegura9' },
    });
    expect(login.status()).toBe(200);
    const { accessToken, refreshToken } = await login.json();

    const me = await request.get('/api/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ email: 'e2e@ucb.edu.bo', fullName: 'Alumno E2E' });

    const rotated = await request.post('/api/v1/auth/refresh', { data: { refreshToken } });
    expect(rotated.status()).toBe(200);
    const { refreshToken: newRefreshToken } = await rotated.json();

    // Reintentar el refresh viejo (ya rotado) revoca la familia completa.
    const reuse = await request.post('/api/v1/auth/refresh', { data: { refreshToken } });
    expect(reuse.status()).toBe(401);

    const afterReuse = await request.post('/api/v1/auth/refresh', {
      data: { refreshToken: newRefreshToken },
    });
    expect(afterReuse.status()).toBe(401);

    // Ciclo de logout, sobre una sesión nueva.
    const freshLogin = await request.post('/api/v1/auth/login', {
      data: { email: 'e2e@ucb.edu.bo', password: 'unaClaveSegura9' },
    });
    const freshRefreshToken = (await freshLogin.json()).refreshToken;

    const logout = await request.post('/api/v1/auth/logout', {
      data: { refreshToken: freshRefreshToken },
    });
    expect(logout.status()).toBe(204);

    const afterLogout = await request.post('/api/v1/auth/refresh', {
      data: { refreshToken: freshRefreshToken },
    });
    expect(afterLogout.status()).toBe(401);
  });
});
