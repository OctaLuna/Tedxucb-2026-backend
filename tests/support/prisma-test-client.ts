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
 * `users` (módulo `users`, 001-c en adelante): trunca también el catálogo y
 * los datos de alumno. CASCADE se encarga del orden de dependencia real
 * (student_profiles/consent_acceptances/correction_requests referencian
 * users; careers referencia faculties) — no hace falta listarlas dos veces.
 */
export async function cleanAllTables(): Promise<void> {
  await prismaTestClient.$executeRawUnsafe(
    'TRUNCATE TABLE audit_log, refresh_tokens, auth_tokens, correction_requests, ' +
      'consent_acceptances, consent_versions, student_profiles, careers, faculties, ' +
      'events, content_blocks, speaker_applications, speakers, point_transactions, ' +
      'attendances, activity_staff, activities, activity_categories, ' +
      'user_roles, users RESTART IDENTITY CASCADE',
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
