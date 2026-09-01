import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import { AppModule } from '../../src/app.module';
import { TokenPairService } from '../../src/modules/auth/token-pair.service';
import { cleanAuthTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { seedUser } from '../support/seed-user';

describe('TokenPairService (integración, invocado sin HTTP — Artículo I)', () => {
  let app: INestApplication;
  let tokenPair: TokenPairService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokenPair = app.get(TokenPairService);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAuthTables();
  });

  it('issue crea una fila en refresh_tokens con family_id propio', async () => {
    const user = await seedUser({ email: 'issue@ucb.edu.bo', roles: ['ALUMNO'] });

    const pair = await tokenPair.issue({ id: user.id, status: user.status, roles: ['ALUMNO'] });

    const rows = await prismaTestClient.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(pair.expiresIn).toBe(900);
  });

  it('rotate encadena replacedById y conserva el family_id', async () => {
    const user = await seedUser({ email: 'rotate@ucb.edu.bo', roles: ['ALUMNO'] });
    const first = await tokenPair.issue({ id: user.id, status: user.status, roles: ['ALUMNO'] });

    await tokenPair.rotate(first.refreshToken);

    const rows = await prismaTestClient.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
    expect(rows[0].familyId).toEqual(rows[1].familyId);
    const original = rows.find((r) => r.replacedById !== null);
    expect(original?.replacedById).toEqual(rows.find((r) => r.id !== original?.id)?.id);
  });

  it('el reuso de un token ya rotado revoca toda la familia y audita el evento', async () => {
    const user = await seedUser({ email: 'reuse@ucb.edu.bo', roles: ['ALUMNO'] });
    const first = await tokenPair.issue({ id: user.id, status: user.status, roles: ['ALUMNO'] });
    await tokenPair.rotate(first.refreshToken);

    await expect(tokenPair.rotate(first.refreshToken)).rejects.toMatchObject({
      error: 'INVALID_REFRESH_TOKEN',
    });

    const rows = await prismaTestClient.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

    const audit = await prismaTestClient.auditLog.findMany({
      where: { actorId: user.id, action: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });
    expect(audit).toHaveLength(1);
  });

  it('revokeAllForUser revoca todas las sesiones activas sin importar la familia', async () => {
    const user = await seedUser({ email: 'multi@ucb.edu.bo', roles: ['ALUMNO'] });
    await tokenPair.issue({ id: user.id, status: user.status, roles: ['ALUMNO'] });
    await tokenPair.issue({ id: user.id, status: user.status, roles: ['ALUMNO'] });

    await tokenPair.revokeAllForUser(user.id);

    const rows = await prismaTestClient.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
