import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../src/config/env.validation';
import { GoogleAuthService } from '../../../src/modules/auth/google-auth.service';
import type { PrismaService } from '../../../src/common/prisma/prisma.service';
import type { TokenPairService } from '../../../src/modules/auth/token-pair.service';
import type { ConfiguredAdminAccessService } from '../../../src/modules/auth/configured-admin-access.service';

const CLIENT_ID = 'google-verifier-fixture.apps.googleusercontent.com';
const FIXTURE_KID = 'local-test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const fixtureCertificate = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signedIdToken(
  overrides: Record<string, unknown> = {},
  signingKey = privateKey,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: FIXTURE_KID, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-subject-fixture',
    email: 'person@example.test',
    email_verified: true,
    nonce: 'fixture-nonce',
    iat: now,
    exp: now + 60,
    ...overrides,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url')}`;
}

describe('Google ID token provider verification with a local signing key', () => {
  let service: GoogleAuthService;
  let getdel: jest.Mock;
  let certificates: jest.SpyInstance;

  beforeAll(() => {
    certificates = jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: { [FIXTURE_KID]: fixtureCertificate },
      format: 'pem',
    } as never);
  });

  afterAll(() => certificates.mockRestore());

  beforeEach(() => {
    getdel = jest.fn().mockResolvedValue('1');
    service = new GoogleAuthService(
      {} as PrismaService,
      {} as TokenPairService,
      { get: () => CLIENT_ID } as unknown as ConfigService<EnvConfig, true>,
      {} as ConfiguredAdminAccessService,
      { getdel } as never,
    );
  });

  it('accepts a correctly signed, current ID token for the configured audience and one-time nonce', async () => {
    const claims = await service.verifyClaims(signedIdToken(), 'fixture-nonce');

    expect(claims.sub).toBe('google-subject-fixture');
    expect(claims.aud).toBe(CLIENT_ID);
    expect(getdel).toHaveBeenCalledTimes(1);
  });

  it('rejects a token signed by a different key', async () => {
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

    await expect(service.verifyClaims(signedIdToken({}, otherKey), 'fixture-nonce'))
      .rejects.toMatchObject({ error: 'INVALID_GOOGLE_CREDENTIAL' });
    expect(getdel).not.toHaveBeenCalled();
  });

  it.each([
    ['issuer', { iss: 'https://attacker.example' }],
    ['audience', { aud: 'another-client.apps.googleusercontent.com' }],
    ['expired timestamp', { exp: Math.floor(Date.now() / 1000) - 600 }],
  ])('rejects a valid signature with an invalid %s', async (_caseName, claims) => {
    await expect(service.verifyClaims(signedIdToken(claims), 'fixture-nonce'))
      .rejects.toMatchObject({ error: 'INVALID_GOOGLE_CREDENTIAL' });
    expect(getdel).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong nonce', { nonce: 'different-nonce' }, 'fixture-nonce'],
    ['unverified email', { email_verified: false }, 'fixture-nonce'],
    ['missing subject claim', { sub: undefined }, 'fixture-nonce'],
  ])('rejects a signed token with %s before consuming the challenge', async (_caseName, claims, nonce) => {
    await expect(service.verifyClaims(signedIdToken(claims), nonce))
      .rejects.toMatchObject({ error: 'INVALID_GOOGLE_CREDENTIAL' });
    expect(getdel).not.toHaveBeenCalled();
  });

  it('rejects a replayed or expired Redis nonce after cryptographic verification', async () => {
    getdel.mockResolvedValueOnce(null);

    await expect(service.verifyClaims(signedIdToken(), 'fixture-nonce'))
      .rejects.toMatchObject({ error: 'INVALID_GOOGLE_CHALLENGE' });
    expect(getdel).toHaveBeenCalledTimes(1);
  });
});
