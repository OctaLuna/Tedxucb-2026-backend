import { prismaTestClient, cleanAuthTables, closeTestDb } from '../support/prisma-test-client';
import { seedUser } from '../support/seed-user';

describe('Restricciones del motor — tablas de auth (T028)', () => {
  beforeEach(async () => {
    await cleanAuthTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('email siempre en minúsculas (RF-106)', () => {
    it('el CHECK rechaza una fila insertada con mayúsculas, sin pasar por el servicio', async () => {
      await expect(
        prismaTestClient.user.create({
          data: {
            email: 'Maria@UCB.EDU.BO',
            passwordHash: 'x',
            fullName: 'Maria',
            status: 'ACTIVE',
            registrationSource: 'ADMIN_CREATED',
          },
        }),
      ).rejects.toThrow();
    });

    it('el UNIQUE rechaza dos cuentas con el mismo correo ya normalizado', async () => {
      await seedUser({ email: 'duplicado@ucb.edu.bo' });

      await expect(seedUser({ email: 'duplicado@ucb.edu.bo' })).rejects.toThrow();
    });
  });

  describe('RF-119 — nunca sin administrador activo', () => {
    it('rechaza retirar el rol ADMIN del único administrador activo', async () => {
      const admin = await seedUser({ email: 'unico-admin@ucb.edu.bo', roles: ['ADMIN'] });

      await expect(
        prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin.id, role: 'ADMIN' } } }),
      ).rejects.toThrow();
    });

    it('permite retirar el rol ADMIN cuando hay otro administrador activo', async () => {
      const admin1 = await seedUser({ email: 'admin1@ucb.edu.bo', roles: ['ADMIN'] });
      await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });

      await expect(
        prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin1.id, role: 'ADMIN' } } }),
      ).resolves.toBeDefined();
    });

    it('rechaza deshabilitar al único administrador activo', async () => {
      const admin = await seedUser({ email: 'solo@ucb.edu.bo', roles: ['ADMIN'] });

      await expect(
        prismaTestClient.user.update({ where: { id: admin.id }, data: { status: 'DISABLED' } }),
      ).rejects.toThrow();
    });

    it('con dos administradores concurrentes, retirar ambos roles a la vez deja pasar solo uno', async () => {
      const admin1 = await seedUser({ email: 'concurrente1@ucb.edu.bo', roles: ['ADMIN'] });
      const admin2 = await seedUser({ email: 'concurrente2@ucb.edu.bo', roles: ['ADMIN'] });

      const results = await Promise.allSettled([
        prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin1.id, role: 'ADMIN' } } }),
        prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin2.id, role: 'ADMIN' } } }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it('serializa la revocacion de rol y la deshabilitacion concurrentes', async () => {
      const admin1 = await seedUser({ email: 'mixto1@ucb.edu.bo', roles: ['ADMIN'] });
      const admin2 = await seedUser({ email: 'mixto2@ucb.edu.bo', roles: ['ADMIN'] });

      const results = await Promise.allSettled([
        prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin1.id, role: 'ADMIN' } } }),
        prismaTestClient.user.update({ where: { id: admin2.id }, data: { status: 'DISABLED' } }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const activeAdmins = await prismaTestClient.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        WHERE ur.role = 'ADMIN' AND u.status = 'ACTIVE'
      `;
      expect(Number(activeAdmins[0]?.count)).toBe(1);
    });
  });

  describe('auth_tokens es de un solo uso', () => {
    it('rechaza modificar consumed_at de un token ya consumido', async () => {
      const user = await seedUser({ email: 'token-user@ucb.edu.bo' });
      const created = await prismaTestClient.authToken.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
        },
      });

      await expect(
        prismaTestClient.authToken.update({ where: { id: created.id }, data: { consumedAt: new Date() } }),
      ).rejects.toThrow();
    });

    it('el índice único parcial impide dos tokens pendientes del mismo tipo para el mismo usuario', async () => {
      const user = await seedUser({ email: 'dos-tokens@ucb.edu.bo' });
      await prismaTestClient.authToken.create({
        data: {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: 'c'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await expect(
        prismaTestClient.authToken.create({
          data: {
            userId: user.id,
            type: 'PASSWORD_RESET',
            tokenHash: 'd'.repeat(64),
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ).rejects.toThrow();
    });
  });
});
