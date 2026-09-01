import { PasswordHashingService } from '../../../src/modules/auth/password-hashing.service';

describe('PasswordHashingService', () => {
  const service = new PasswordHashingService();

  it('produce un hash Argon2id verificable con la contraseña original', async () => {
    const hash = await service.hash('unaClaveSegura9');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'unaClaveSegura9')).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta contra un hash válido', async () => {
    const hash = await service.hash('unaClaveSegura9');

    await expect(service.verify(hash, 'otra-clave')).resolves.toBe(false);
  });

  it('no lanza ante un hash con formato corrupto, devuelve false', async () => {
    await expect(service.verify('no-es-un-hash-argon2', 'cualquier-cosa')).resolves.toBe(false);
  });
});
