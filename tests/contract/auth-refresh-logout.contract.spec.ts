import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

async function login(app: INestApplication, email: string, password: string) {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  return response.body as { accessToken: string; refreshToken: string };
}

describe('POST /api/v1/auth/refresh, /logout, /logout-all (contrato)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
    await closeRedisTestClient();
  });

  beforeEach(async () => {
    await cleanAuthTables();
    await cleanRateLimits();
  });

  it('rota el refresh token y devuelve un par nuevo', async () => {
    await seedUser({ email: 'a@ucb.edu.bo', password: 'unaClaveSegura9' });
    const { refreshToken } = await login(app, 'a@ucb.edu.bo', 'unaClaveSegura9');

    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).not.toEqual(refreshToken);
  });

  it('rechaza con 401 un refresh token inexistente', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'token-que-no-existe' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('reusar un refresh token ya rotado revoca toda la familia (401 en ambos)', async () => {
    await seedUser({ email: 'b@ucb.edu.bo', password: 'unaClaveSegura9' });
    const { refreshToken: original } = await login(app, 'b@ucb.edu.bo', 'unaClaveSegura9');

    const rotated = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(rotated.status).toBe(200);
    const newRefreshToken = rotated.body.refreshToken as string;

    // Reusar el token viejo (ya rotado) debe rechazarse Y revocar la familia.
    const reuse = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('INVALID_REFRESH_TOKEN');

    // El token emitido en la rotación legítima también queda revocado.
    const afterReuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('logout revoca la sesión presentada, un refresh posterior falla', async () => {
    await seedUser({ email: 'c@ucb.edu.bo', password: 'unaClaveSegura9' });
    const { refreshToken } = await login(app, 'c@ucb.edu.bo', 'unaClaveSegura9');

    const logout = await request(app.getHttpServer()).post('/api/v1/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(204);

    const afterLogout = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('logout-all revoca todas las sesiones del usuario autenticado', async () => {
    await seedUser({ email: 'd@ucb.edu.bo', password: 'unaClaveSegura9' });
    const sessionA = await login(app, 'd@ucb.edu.bo', 'unaClaveSegura9');
    const sessionB = await login(app, 'd@ucb.edu.bo', 'unaClaveSegura9');

    const logoutAll = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send();
    expect(logoutAll.status).toBe(204);

    const refreshA = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: sessionA.refreshToken });
    const refreshB = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: sessionB.refreshToken });

    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(401);
  });

  it('logout-all sin autenticar responde 401', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/logout-all').send();
    expect(response.status).toBe(401);
  });
});
