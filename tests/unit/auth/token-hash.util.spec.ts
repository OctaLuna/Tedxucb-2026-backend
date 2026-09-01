import { generateOpaqueToken, hashToken } from '../../../src/common/crypto/token-hash.util';

describe('token-hash.util', () => {
  it('genera tokens distintos en cada llamada', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();

    expect(a).not.toEqual(b);
    expect(a).toHaveLength(64); // 32 bytes en hex
  });

  it('produce el mismo hash para el mismo token, y distinto para otro', () => {
    const token = generateOpaqueToken();

    expect(hashToken(token)).toEqual(hashToken(token));
    expect(hashToken(token)).not.toEqual(hashToken(generateOpaqueToken()));
  });

  it('el hash no revela el token original', () => {
    const token = generateOpaqueToken();

    expect(hashToken(token)).not.toContain(token);
  });
});
