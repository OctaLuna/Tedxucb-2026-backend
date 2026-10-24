import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import request from 'supertest';

jest.setTimeout(60_000);

// This suite always targets the dedicated local integration services. In
// particular, it must never inherit DATABASE_URL from a developer's .env.
const TEST_DATABASE_URL =
  'postgresql://ted_test:local_test_only@127.0.0.1:55432/ted_integration_test?schema=public';
const TEST_REDIS_URL = 'redis://127.0.0.1:56379';
const CLIENT_ID = 'google-auth-test-client.apps.googleusercontent.com';
const EVENT_SLUG = 'google-auth-contract-test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
process.env.ADMIN_EMAILS = 'Bootstrap.Admin@gmail.com';
process.env.JWT_SECRET ??= 'google-contract-jwt-secret-that-is-at-least-32-chars';
process.env.QR_TOKEN_SECRET ??= 'google-contract-qr-secret-that-is-at-least-32-chars';

describe('POST /api/v1/auth/google (contrato RF-501 a RF-508)', () => {
  let app: INestApplication;
  let prismaTestClient: typeof import('../support/prisma-test-client').prismaTestClient;
  let redisTestClient: typeof import('../support/redis-test-client').redisTestClient;
  let closeTestDb: typeof import('../support/prisma-test-client').closeTestDb;
  let verifyIdToken: jest.SpyInstance;
  let payloads: Map<string, TokenPayload | null>;

  beforeAll(async () => {
    // Dynamic imports happen after the test-only URLs above have replaced any
    // values loaded from .env.
    const db = await import('../support/prisma-test-client');
    const redis = await import('../support/redis-test-client');
    const testApp = await import('../support/test-app');
    prismaTestClient = db.prismaTestClient;
    redisTestClient = redis.redisTestClient;
    closeTestDb = db.closeTestDb;
    app = await testApp.createTestApp();
    payloads = new Map();
    verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(
      async ({ idToken, audience }) => {
        // The production service delegates signature, issuer, expiry and
        // audience validation to google-auth-library's official verifier.
        if (audience !== CLIENT_ID) throw new Error('unexpected audience');
        const payload = payloads.get(idToken);
        if (payload === null || payload === undefined) throw new Error('invalid signature or claims');
        return { getPayload: () => payload } as never;
      },
    );
  });

  afterAll(async () => {
    verifyIdToken?.mockRestore();
    await app?.close();
    await closeTestDb?.();
    await redisTestClient?.quit();
  });

  beforeEach(async () => {
    payloads.clear();
    const rateKeys = await redisTestClient.keys('rate-limit:*');
    if (rateKeys.length) await redisTestClient.del(...rateKeys);
    await prismaTestClient.$executeRawUnsafe(
      'TRUNCATE TABLE audit_log, refresh_tokens, auth_tokens, user_roles, users RESTART IDENTITY CASCADE',
    );
    await prismaTestClient.eventEmailAccess.deleteMany({ where: { event: { slug: EVENT_SLUG } } });
    await prismaTestClient.event.deleteMany({ where: { slug: EVENT_SLUG } });
  });

  async function challenge() {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/google/challenge').send({});
    expect(response.status).toBe(200);
    expect(response.body.nonce).toEqual(expect.any(String));
    return response.body.nonce as string;
  }

  async function login(claims: Partial<TokenPayload> | null, nonce?: string, credential = 'signed-test-token') {
    const challengeNonce = nonce ?? (await challenge());
    payloads.set(credential, claims as TokenPayload | null);
    return request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ credential, nonce: challengeNonce });
  }

  function ucbClaims(nonce: string, overrides: Partial<TokenPayload> = {}): TokenPayload {
    return {
      sub: 'google-sub-ucb-001',
      email: 'Persona@UCB.edu.bo',
      email_verified: true,
      hd: 'ucb.edu.bo',
      name: 'Persona UCB',
      nonce,
      ...overrides,
    } as TokenPayload;
  }

  it('delegates ID-token verification with the configured audience and rejects verifier failures', async () => {
    const nonce = await challenge();
    payloads.set('tampered-token', null);

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ credential: 'tampered-token', nonce });

    expect(rejected.status).toBe(401);
    expect(rejected.body.error).toBe('INVALID_GOOGLE_CREDENTIAL');
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'tampered-token', audience: CLIENT_ID });
    expect(await prismaTestClient.user.count()).toBe(0);
  });

  it('consumes a challenge once and rejects an unverified email before creating an account', async () => {
    const nonce = await challenge();
    payloads.set('unverified-token', ucbClaims(nonce, { email_verified: false }));
    const unverified = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ credential: 'unverified-token', nonce });
    expect(unverified.status).toBe(401);
    expect(unverified.body.error).toBe('INVALID_GOOGLE_CREDENTIAL');
    expect(await prismaTestClient.user.count()).toBe(0);

    const validNonce = await challenge();
    const validCredential = 'verified-token';
    payloads.set(validCredential, ucbClaims(validNonce));
    const accepted = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ credential: validCredential, nonce: validNonce });
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ credential: validCredential, nonce: validNonce });

    expect(accepted.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('INVALID_GOOGLE_CHALLENGE');
    expect(await prismaTestClient.user.count()).toBe(1);
  });

  it('concede ADMIN y acceso a TEDxUCB e Innovation Week solo a correos de la allowlist del servidor', async () => {
    await prismaTestClient.event.upsert({
      where: { slug: 'tedxucb' }, update: {},
      create: { slug: 'tedxucb', name: 'TEDxUCB', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    await prismaTestClient.event.upsert({
      where: { slug: 'innovation-week' }, update: {},
      create: { slug: 'innovation-week', name: 'Innovation Week', startsAt: new Date('2027-02-01T12:00:00Z') },
    });

    const nonce = await challenge();
    const claims = {
      sub: 'configured-admin-google-sub', email: 'Bootstrap.Admin@gmail.com', email_verified: true,
      nonce, name: 'Administrador de prueba',
    } as TokenPayload;
    const response = await login(claims, nonce, 'configured-admin-token');

    expect(response.status).toBe(200);
    expect(response.body.user.roles).toContain('ADMIN');
    const events = await request(app.getHttpServer())
      .get('/api/v1/me/events')
      .set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(events.status).toBe(200);
    expect(events.body.data.map(({ slug }: { slug: string }) => slug).sort()).toEqual(['innovation-week', 'tedxucb']);

    const adminRows = await prismaTestClient.eventEmailAccess.findMany({
      where: { emailNormalized: 'bootstrap.admin@gmail.com', revokedAt: null },
      include: { event: { select: { slug: true } } },
    });
    expect(adminRows.map(({ event }) => event.slug).sort()).toEqual(['innovation-week', 'tedxucb']);

    const nextNonce = await challenge();
    const repeated = await login({ ...claims, nonce: nextNonce }, nextNonce, 'configured-admin-token-retry');
    expect(repeated.status).toBe(200);
    expect(await prismaTestClient.userRole.count({ where: { role: 'ADMIN' } })).toBe(1);
    expect(await prismaTestClient.eventEmailAccess.count({
      where: { emailNormalized: 'bootstrap.admin@gmail.com', revokedAt: null },
    })).toBe(2);
  });

  it('no concede ADMIN ni permisos de evento a una cuenta configurada que todavía no está activa', async () => {
    const { seedUser } = await import('../support/seed-user');
    const email = 'bootstrap.admin@gmail.com';
    await prismaTestClient.eventEmailAccess.deleteMany({ where: { emailNormalized: email } });
    const existing = await seedUser({
      email,
      status: 'PENDING',
      registrationSource: 'SELF_REGISTRATION',
      roles: ['STAFF'],
    });
    const nonce = await challenge();
    const response = await login({
      sub: 'configured-pending-admin-google-sub', email, email_verified: true, nonce,
    }, nonce, 'configured-pending-admin-token');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACCOUNT_NOT_ACTIVE');
    const persisted = await prismaTestClient.user.findUnique({ where: { id: existing.id }, include: { roles: true } });
    expect(persisted?.roles.map(({ role }) => role)).toEqual(['STAFF']);
    expect(await prismaTestClient.eventEmailAccess.count({ where: { emailNormalized: email, revokedAt: null } })).toBe(0);
  });

  it('acepta solo el dominio Workspace institucional exacto', async () => {
    const validNonce = await challenge();
    const valid = await login(ucbClaims(validNonce), validNonce, 'workspace-exact');
    expect(valid.status).toBe(200);
    expect(valid.body.user.email).toBe('persona@ucb.edu.bo');

    const suffixNonce = await challenge();
    const suffix = await login(
      ucbClaims(suffixNonce, { sub: 'lookalike-sub', email: 'alguien@ucb.edu.bo.evil', hd: 'ucb.edu.bo.evil' }),
      suffixNonce,
      'workspace-lookalike',
    );
    expect(suffix.status).toBe(403);
    expect(suffix.body.error).toBe('EMAIL_NOT_AUTHORIZED');

    const mismatchNonce = await challenge();
    const mismatch = await login(
      ucbClaims(mismatchNonce, { sub: 'mismatch-sub', email: 'otra@ucb.edu.bo', hd: 'gmail.com' }),
      mismatchNonce,
      'workspace-mismatch',
    );
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('EMAIL_OWNERSHIP_REQUIRED');
  });

  it('exige whitelist activa para cuentas externas y admite Gmail solo después de autorización', async () => {
    const deniedNonce = await challenge();
    const denied = await login(
      { sub: 'external-denied', email: 'Persona.Externa@gmail.com', email_verified: true, nonce: deniedNonce },
      deniedNonce,
      'external-denied',
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('EMAIL_NOT_AUTHORIZED');

    const event = await prismaTestClient.event.create({
      data: { slug: EVENT_SLUG, name: 'Prueba auth Google', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    await prismaTestClient.eventEmailAccess.create({
      data: { eventId: event.id, emailNormalized: 'persona.externa@gmail.com' },
    });
    const authorizedNonce = await challenge();
    const authorized = await login(
      { sub: 'external-authorized', email: 'Persona.Externa@gmail.com', email_verified: true, nonce: authorizedNonce },
      authorizedNonce,
      'external-authorized',
    );
    expect(authorized.status).toBe(200);
    expect(authorized.body.user.email).toBe('persona.externa@gmail.com');
    expect(authorized.body.user.roles).not.toContain('ADMIN');

    await prismaTestClient.eventEmailAccess.create({
      data: { eventId: event.id, emailNormalized: 'persona@empresa.example' },
    });
    const workspaceNonce = await challenge();
    const workspaceExternal = await login(
      {
        sub: 'external-workspace-authorized',
        email: 'persona@empresa.example',
        email_verified: true,
        hd: 'empresa.example',
        nonce: workspaceNonce,
      },
      workspaceNonce,
      'external-workspace-authorized',
    );
    expect(workspaceExternal.status).toBe(200);
    expect(workspaceExternal.body.user.email).toBe('persona@empresa.example');

    const insufficientProofNonce = await challenge();
    const insufficientProof = await login(
      {
        sub: 'external-without-google-proof',
        email: 'persona@empresa.example',
        email_verified: true,
        nonce: insufficientProofNonce,
      },
      insufficientProofNonce,
      'external-without-google-proof',
    );
    expect(insufficientProof.status).toBe(403);
    expect(insufficientProof.body.error).toBe('EMAIL_OWNERSHIP_REQUIRED');
  });

  it.each(['PENDING', 'REJECTED', 'INVITED'] as const)(
    'vincula la cuenta legacy %s, conserva rol/estado y mantiene el bloqueo',
    async (status) => {
      const { seedUser } = await import('../support/seed-user');
      const email = `${status.toLowerCase()}@ucb.edu.bo`;
      const registrationSource = status === 'PENDING' || status === 'REJECTED' ? 'SELF_REGISTRATION' : 'ADMIN_CREATED';
      const existing = await seedUser({ email, status, roles: ['STAFF'], registrationSource });
      const nonce = await challenge();
      const response = await login(ucbClaims(nonce, { sub: `legacy-${status}`, email }), nonce, `legacy-${status}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'ACCOUNT_NOT_ACTIVE', details: { status } });
      const user = await prismaTestClient.user.findUnique({
        where: { id: existing.id },
        include: { roles: true, identities: true },
      });
      expect(user?.status).toBe(status);
      expect(user?.roles.map(({ role }) => role)).toEqual(['STAFF']);
      expect(user?.identities).toHaveLength(1);
      expect(user?.identities[0].subject).toBe(`legacy-${status}`);
    },
  );

  it('no reactiva una cuenta DISABLED ni la vincula', async () => {
    const { seedUser } = await import('../support/seed-user');
    const email = 'disabled@ucb.edu.bo';
    const existing = await seedUser({ email, status: 'DISABLED' });
    const nonce = await challenge();
    const response = await login(ucbClaims(nonce, { sub: 'disabled-sub', email }), nonce, 'disabled-account');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACCOUNT_NOT_ACTIVE');
    expect(await prismaTestClient.userIdentity.count({ where: { userId: existing.id } })).toBe(0);
    expect((await prismaTestClient.user.findUnique({ where: { id: existing.id } }))?.status).toBe('DISABLED');
  });

  it('reutiliza la identidad y la cuenta al repetir inicio, sin crear vínculos duplicados', async () => {
    const firstNonce = await challenge();
    const first = await login(ucbClaims(firstNonce, { sub: 'stable-sub' }), firstNonce, 'first-login');
    const secondNonce = await challenge();
    const second = await login(ucbClaims(secondNonce, { sub: 'stable-sub' }), secondNonce, 'second-login');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prismaTestClient.user.count()).toBe(1);
    expect(await prismaTestClient.userIdentity.count()).toBe(1);
  });

  it('mantiene una sola cuenta y una sola identidad ante dos primeras solicitudes concurrentes', async () => {
    const nonce1 = await challenge();
    const nonce2 = await challenge();
    payloads.set('race-one', ucbClaims(nonce1, { sub: 'race-sub' }));
    payloads.set('race-two', ucbClaims(nonce2, { sub: 'race-sub' }));

    const results = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/google').send({ credential: 'race-one', nonce: nonce1 }),
      request(app.getHttpServer()).post('/api/v1/auth/google').send({ credential: 'race-two', nonce: nonce2 }),
    ]);

    expect(results.some(({ status }) => status === 200)).toBe(true);
    expect(results.every(({ status }) => status === 200 || status === 409)).toBe(true);
    expect(await prismaTestClient.user.count()).toBe(1);
    expect(await prismaTestClient.userIdentity.count()).toBe(1);
  });
});
