import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL is required for integration tests.');
}

const testDatabaseHost = new URL(testDatabaseUrl).hostname.toLowerCase();
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(testDatabaseHost) || testDatabaseName !== 'ted_integration_test') {
  throw new Error(
    `Integration tests require the isolated local database ted_integration_test; received "${testDatabaseHost}/${testDatabaseName}".`,
  );
}

const adapter = new PrismaPg({ connectionString: testDatabaseUrl });

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
    'TRUNCATE TABLE audit_log, refresh_tokens, auth_tokens, identity_invitations, external_email_proofs, ' +
      'event_email_access, correction_requests, ' +
      'consent_acceptances, consent_versions, student_profiles, careers, faculties, ' +
      'selections, selection_runs, events, content_blocks, speaker_applications, speakers, ' +
      'point_transactions, attendances, activity_staff, activities, activity_categories, ' +
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
