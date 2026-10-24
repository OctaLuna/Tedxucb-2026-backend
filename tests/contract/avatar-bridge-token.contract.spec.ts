import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { cleanAuthTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

const bridgeSecret = 'avatar-bridge-contract-secret-at-least-32-characters';
process.env.AVATAR_BRIDGE_SECRET = bridgeSecret;

describe('GET /api/v1/me/avatar-session (contrato)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const { createTestApp } = await import('../support/test-app');
    app = await createTestApp();
  });
  afterAll(async () => { await app.close(); await closeTestDb(); await closeRedisTestClient(); });
  beforeEach(async () => { await cleanAuthTables(); await cleanRateLimits(); });

  it('emite un token breve, limitado a avatar:claim y firmado con secreto separado', async () => {
    const user = await seedUser({ email: 'avatar-bridge@ucb.edu.bo', password: 'unaClaveSegura9' });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password: 'unaClaveSegura9' });
    const response = await request(app.getHttpServer()).get('/api/v1/me/avatar-session').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(200);
    const [header, claims, signature] = response.body.token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    const unsigned = `${header}.${claims}`;
    expect(signature).toBe(createHmac('sha256', bridgeSecret).update(unsigned).digest('base64url'));
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'tedx-ucb-backend', aud: 'avatar-2d', sub: user.id, scope: 'avatar:claim',
    });
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString()) as { iat: number; exp: number; jti: string };
    expect(payload.exp - payload.iat).toBe(90);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.expiresAt).toBe(new Date(payload.exp * 1000).toISOString());

    const revoke = await request(app.getHttpServer()).post('/api/v1/me/avatar-session/revocation-token').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(revoke.status).toBe(201);
    const revokeClaims = JSON.parse(Buffer.from(revoke.body.token.split('.')[1], 'base64url').toString());
    expect(revokeClaims.scope).toBe('avatar:revoke');
  });

  it('requiere una sesión autenticada', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/me/avatar-session')).status).toBe(401);
  });
});
