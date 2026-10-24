import { validateEnv } from '../../../src/config/env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://ted:ted@localhost:5432/ted_backend?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
  QR_TOKEN_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('acepta un conjunto de variables válido', () => {
    expect(() => validateEnv(baseEnv)).not.toThrow();
  });

  it('rechaza el arranque si falta DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = baseEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rechaza el arranque si falta JWT_SECRET', () => {
    const { JWT_SECRET, ...rest } = baseEnv;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('trata un GOOGLE_CLIENT_ID vacío como no configurado', () => {
    expect(validateEnv({ ...baseEnv, GOOGLE_CLIENT_ID: '' }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('requiere GOOGLE_CLIENT_ID al arrancar en producción', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production', AVATAR_BRIDGE_SECRET: 'c'.repeat(32) })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com', AVATAR_BRIDGE_SECRET: 'c'.repeat(32) })).not.toThrow();
  });

  it('normaliza y deduplica ADMIN_EMAILS como allowlist del backend', () => {
    expect(validateEnv({ ...baseEnv, ADMIN_EMAILS: ' Bootstrap.Admin@gmail.com,bootstrap.admin@gmail.com ' }).ADMIN_EMAILS)
      .toEqual(['bootstrap.admin@gmail.com']);
    expect(() => validateEnv({ ...baseEnv, ADMIN_EMAILS: 'not-an-email' })).toThrow(/ADMIN_EMAILS/);
  });

  it('requires a separate avatar bridge secret in production', () => {
    const productionWithGoogle = { ...baseEnv, NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com' };
    expect(() => validateEnv(productionWithGoogle)).toThrow(/AVATAR_BRIDGE_SECRET/);
    expect(() => validateEnv({ ...productionWithGoogle, AVATAR_BRIDGE_SECRET: 'c'.repeat(32) })).not.toThrow();
  });
});
