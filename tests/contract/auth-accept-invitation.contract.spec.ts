import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAuthTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { generateOpaqueToken, hashToken } from '../../src/common/crypto/token-hash.util';

async function seedInvitation(userId: string, adminId: string, overrides: { expired?: boolean } = {}) {
  const token = generateOpaqueToken();
  // El CHECK valid_expiry_window exige expires_at > created_at y
  // expires_at <= created_at + 7 días: para simular un token vencido hay
  // que retrasar ambas fechas, no solo expires_at.
  const createdAt = overrides.expired ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) : new Date();
  const expiresAt = overrides.expired
    ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prismaTestClient.authToken.create({
    data: {
      userId,
      type: 'INVITATION',
      tokenHash: hashToken(token),
      createdById: adminId,
      createdAt,
      expiresAt,
    },
  });

  return token;
}

describe('POST /api/v1/auth/accept-invitation (contrato)', () => {
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

  it('activa la cuenta invitada y fija la contraseña', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const staff = await seedUser({
      email: 'staff@ucb.edu.bo',
      status: 'INVITED',
      registrationSource: 'ADMIN_CREATED',
      roles: ['STAFF'],
    });
    const token = await seedInvitation(staff.id, admin.id);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, password: 'unaClaveSeguraNueva9' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: staff.id, status: 'ACTIVE' });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'staff@ucb.edu.bo', password: 'unaClaveSeguraNueva9' });
    expect(login.status).toBe(200);
  });

  it('rechaza con 400 INVALID_TOKEN un token inexistente', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token: 'token-inventado', password: 'unaClaveSeguraNueva9' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TOKEN');
  });

  it('rechaza con 410 EXPIRED_TOKEN una invitación vencida', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const staff = await seedUser({
      email: 'staff2@ucb.edu.bo',
      status: 'INVITED',
      registrationSource: 'ADMIN_CREATED',
      roles: ['STAFF'],
    });
    const token = await seedInvitation(staff.id, admin.id, { expired: true });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, password: 'unaClaveSeguraNueva9' });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('EXPIRED_TOKEN');
  });

  it('rechaza con 400 INVALID_TOKEN una invitación ya usada', async () => {
    const admin = await seedUser({ email: 'admin3@ucb.edu.bo', roles: ['ADMIN'] });
    const staff = await seedUser({
      email: 'staff3@ucb.edu.bo',
      status: 'INVITED',
      registrationSource: 'ADMIN_CREATED',
      roles: ['STAFF'],
    });
    const token = await seedInvitation(staff.id, admin.id);

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, password: 'unaClaveSeguraNueva9' });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/accept-invitation')
      .send({ token, password: 'otraClaveDistinta9' });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('INVALID_TOKEN');
  });
});
