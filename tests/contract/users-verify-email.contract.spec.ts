import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedCareer, seedConsentVersion } from '../support/seed-catalog';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service';

describe('POST /api/v1/auth/verify-email (contrato)', () => {
  let app: INestApplication;
  let oneTimeToken: OneTimeTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    oneTimeToken = app.get(OneTimeTokenService);
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await prismaTestClient.$disconnect();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  async function registerPendingUser() {
    const { career } = await seedCareer();
    const consentVersion = await seedConsentVersion();
    const email = `pendiente-${Date.now()}@ucb.edu.bo`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Alumno Pendiente',
        email,
        studentCode: `code-${Date.now()}`,
        careerId: career.id,
        academicPeriod: '1er semestre',
        phone: '+59170000001',
        password: 'unaClaveSegura9',
        consentVersionId: consentVersion.id,
      });
    const user = await prismaTestClient.user.findUniqueOrThrow({ where: { email } });
    const authToken = await prismaTestClient.authToken.findFirstOrThrow({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
    });
    return { user, authToken, email };
  }

  it('activa la cuenta pendiente con un token válido', async () => {
    const { user } = await registerPendingUser();
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: user.id, status: 'ACTIVE' });

    const updated = await prismaTestClient.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.status).toBe('ACTIVE');
  });

  it('reintentar con el mismo token ya consumido, cuenta ya activa: 200 idempotente sin efecto nuevo', async () => {
    const { user } = await registerPendingUser();
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });
    await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

    const second = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

    expect(second.status).toBe(200);
    expect(second.body.status).toBe('ACTIVE');
  });

  it('rechaza con 400 INVALID_TOKEN un token inexistente', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'no-existe' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TOKEN');
  });

  it('rechaza con 410 EXPIRED_TOKEN un enlace vencido', async () => {
    const { user } = await registerPendingUser();
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });
    await prismaTestClient.authToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
      data: {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('EXPIRED_TOKEN');
  });

  it('rechaza con 409 ACCOUNT_NOT_ELIGIBLE un token válido de una cuenta ya rechazada', async () => {
    const { user } = await registerPendingUser();
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });
    await prismaTestClient.user.update({ where: { id: user.id }, data: { status: 'REJECTED' } });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ACCOUNT_NOT_ELIGIBLE');
  });

  it('el alumno no puede iniciar sesión mientras la cuenta sigue PENDING (RF-122)', async () => {
    const { email } = await registerPendingUser();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'unaClaveSegura9' });

    expect(login.status).toBe(403);
    expect(login.body).toMatchObject({ error: 'ACCOUNT_NOT_ACTIVE', details: { status: 'PENDING' } });
  });
});
