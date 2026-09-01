import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prismaTestClient = new PrismaClient({ adapter });

/**
 * Trunca las tablas del módulo auth entre pruebas (Artículo IX: base limpia,
 * nunca mocks). CASCADE porque refresh_tokens/auth_tokens/user_roles/
 * audit_log referencian users.
 */
export async function cleanAuthTables(): Promise<void> {
  await prismaTestClient.$executeRawUnsafe(
    'TRUNCATE TABLE audit_log, refresh_tokens, auth_tokens, user_roles, users RESTART IDENTITY CASCADE',
  );
}

/**
 * Cada archivo de prueba de Jest tiene su propio registro de módulos, así
 * que `prismaTestClient` es una instancia nueva (con su propio pool de
 * conexión) por archivo, aunque solo se importe indirectamente vía
 * `seedUser`/`cleanAuthTables`. Sin desconectarla, el proceso de Node queda
 * vivo después de que las pruebas terminan — llamar en cada `afterAll`.
 */
export async function closeTestDb(): Promise<void> {
  await prismaTestClient.$disconnect();
}
