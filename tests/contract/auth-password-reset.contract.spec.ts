import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service';

describe('POST /api/v1/auth/password-reset/request y /confirm (contrato)', () => {
  let app: INestApplication;
  let oneTimeToken: OneTimeTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    oneTimeToken = app.get(OneTimeTokenService);
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

  it('responde 202 exista o no la cuenta (anti-enumeración)', async () => {
    await seedUser({ email: 'existe@ucb.edu.bo' });

    const existente = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'existe@ucb.edu.bo' });
    const inexistente = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'no-existe@ucb.edu.bo' });

    expect(existente.status).toBe(202);
    expect(inexistente.status).toBe(202);
    expect(existente.body).toEqual(inexistente.body);
  });

  it('emite un auth_token de tipo PASSWORD_RESET solo si la cuenta existe y está activa', async () => {
    const user = await seedUser({ email: 'existe2@ucb.edu.bo', status: 'ACTIVE' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'existe2@ucb.edu.bo' });

    const tokens = await prismaTestClient.authToken.findMany({
      where: { userId: user.id, type: 'PASSWORD_RESET' },
    });
    expect(tokens).toHaveLength(1);
  });

  it('confirma con un token válido, cambia la contraseña y revoca todas las sesiones (logout-all implícito)', async () => {
    const user = await seedUser({ email: 'reset@ucb.edu.bo', password: 'claveOriginal9' });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'reset@ucb.edu.bo', password: 'claveOriginal9' });
    const oldRefreshToken = login.body.refreshToken as string;

    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'PASSWORD_RESET' });

    const confirm = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: 'claveNuevaSegura9' });
    expect(confirm.status).toBe(200);

    // La sesión previa a la recuperación queda revocada (logout-all implícito).
    const oldSessionRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken });
    expect(oldSessionRefresh.status).toBe(401);

    // La contraseña nueva ya funciona.
    const newLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'reset@ucb.edu.bo', password: 'claveNuevaSegura9' });
    expect(newLogin.status).toBe(200);
  });

  it('rechaza con 400 INVALID_TOKEN un token inexistente', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'token-inventado', newPassword: 'claveNuevaSegura9' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TOKEN');
  });

  it('rechaza con 410 EXPIRED_TOKEN un enlace vencido', async () => {
    const user = await seedUser({ email: 'vencido@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'PASSWORD_RESET' });
    // El CHECK valid_expiry_window exige expires_at > created_at y
    // expires_at <= created_at + 7 días: para simular un token vencido hay
    // que retrasar ambas fechas, no solo expires_at.
    await prismaTestClient.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET' },
      data: {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: 'claveNuevaSegura9' });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('EXPIRED_TOKEN');
  });

  it('rechaza con 400 INVALID_TOKEN un enlace ya usado', async () => {
    const user = await seedUser({ email: 'usado@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'PASSWORD_RESET' });

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: 'claveNuevaSegura9' });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: 'otraClaveDistinta9' });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('INVALID_TOKEN');
  });
});
