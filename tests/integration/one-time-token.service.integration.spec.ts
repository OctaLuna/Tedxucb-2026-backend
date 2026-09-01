import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import { AppModule } from '../../src/app.module';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service';
import { cleanAuthTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { seedUser } from '../support/seed-user';

describe('OneTimeTokenService (integración, invocado sin HTTP — Artículo I)', () => {
  let app: INestApplication;
  let oneTimeToken: OneTimeTokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    oneTimeToken = app.get(OneTimeTokenService);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAuthTables();
  });

  it('issue invalida cualquier token pendiente previo del mismo (usuario, tipo)', async () => {
    const user = await seedUser({ email: 'reissue@ucb.edu.bo' });

    const first = await oneTimeToken.issue({ userId: user.id, type: 'PASSWORD_RESET' });
    await oneTimeToken.issue({ userId: user.id, type: 'PASSWORD_RESET' });

    // find() no decide el efecto de negocio: devuelve el token ya marcado
    // consumido (invalidado por el segundo issue), no lanza -- es el
    // llamador quien decide qué hacer ante un token ya consumido.
    const invalidated = await oneTimeToken.find(first.token, 'PASSWORD_RESET');
    expect(invalidated.consumedAt).not.toBeNull();

    const rows = await prismaTestClient.authToken.findMany({ where: { userId: user.id, type: 'PASSWORD_RESET' } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.consumedAt === null)).toHaveLength(1);
  });

  it('find lanza EXPIRED_TOKEN para un token vencido sin consumir', async () => {
    const user = await seedUser({ email: 'expira@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });
    // El CHECK valid_expiry_window exige expires_at > created_at y
    // expires_at <= created_at + 7 días: para simular un token vencido hay
    // que retrasar ambas fechas, no solo expires_at.
    await prismaTestClient.authToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
      data: {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(oneTimeToken.find(token, 'EMAIL_VERIFICATION')).rejects.toMatchObject({
      error: 'EXPIRED_TOKEN',
    });
  });

  it('find lanza INVALID_TOKEN si el tipo no coincide con el token', async () => {
    const user = await seedUser({ email: 'tipo-equivocado@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });

    await expect(oneTimeToken.find(token, 'PASSWORD_RESET')).rejects.toMatchObject({
      error: 'INVALID_TOKEN',
    });
  });

  it('markConsumed queda protegido por el trigger ante un segundo intento', async () => {
    const user = await seedUser({ email: 'consumido@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });
    const record = await oneTimeToken.find(token, 'EMAIL_VERIFICATION');

    await oneTimeToken.markConsumed(record.id);

    await expect(oneTimeToken.markConsumed(record.id)).rejects.toThrow();
  });

  it('expiresAt nunca supera 7 días desde la emisión (RF-108)', async () => {
    const user = await seedUser({ email: 'vigencia@ucb.edu.bo' });
    const { token } = await oneTimeToken.issue({ userId: user.id, type: 'EMAIL_VERIFICATION' });

    const record = await oneTimeToken.find(token, 'EMAIL_VERIFICATION');
    const days = (record.expiresAt.getTime() - record.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(7);
    expect(days).toBeGreaterThan(6.9);
  });
});
