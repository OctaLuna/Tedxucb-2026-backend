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
});
