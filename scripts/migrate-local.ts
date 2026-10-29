import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { resolve } from 'node:path';

const TEDX_SCOPE_MIGRATION = '20261023060000_scope_speakers_to_event';
const TEDX_STARTS_AT = '2026-11-12T14:15:00-04:00';

function localDatabaseUrl(): URL {
  const configured = process.env.DIRECT_URL ??
    'postgresql://ted_test:local_test_only@127.0.0.1:55432/ted_backend_local?schema=public';
  const url = new URL(configured);
  const host = url.hostname.toLowerCase();
  const databaseName = url.pathname.replace(/^\//, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) || url.port !== '55432') {
    throw new Error('This bootstrap is restricted to PostgreSQL on loopback port 55432.');
  }
  if (!databaseName.startsWith('ted_')) {
    throw new Error('This bootstrap requires a database with the ted_ local prefix.');
  }
  return url;
}

function runPrisma(args: string[]): { status: number | null; output: string } {
  const cli = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

function assertSuccessful(result: { status: number | null; output: string }, action: string): void {
  if (result.status === 0) return;
  const redacted = result.output.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@');
  process.stderr.write(`${action} failed.\n${redacted}\n`);
  process.exit(result.status ?? 1);
}

async function seedFreshTedxAfterCoreMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const failedMigration = await client.query<{ failed: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM _prisma_migrations
        WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL
      ) AS failed`,
      [TEDX_SCOPE_MIGRATION],
    );
    if (!failedMigration.rows[0]?.failed) {
      throw new Error('The expected event-scoping migration is not recorded as failed.');
    }

    const preflight = await client.query<{
      event_count: string;
      speaker_count: string;
      application_count: string;
      activity_count: string;
      transaction_count: string;
      selection_count: string;
      content_count: string;
    }>(`
      SELECT
        (SELECT count(*) FROM events) AS event_count,
        (SELECT count(*) FROM speakers) AS speaker_count,
        (SELECT count(*) FROM speaker_applications) AS application_count,
        (SELECT count(*) FROM activities) AS activity_count,
        (SELECT count(*) FROM point_transactions) AS transaction_count,
        (SELECT count(*) FROM selections) AS selection_count,
        (SELECT count(*) FROM content_blocks) AS content_count
    `);
    const counts = preflight.rows[0];
    if (Object.values(counts).some((count) => count !== '0')) {
      throw new Error('The database is not empty; automatic TEDx bootstrap is refused. Preserve and review its data manually.');
    }

    await client.query(
      `INSERT INTO events (name, slug, starts_at, status)
       VALUES ('TEDxUCB', 'tedxucb', $1::timestamptz, 'PUBLISHED')`,
      [TEDX_STARTS_AT],
    );
  } finally {
    await client.end();
  }
}

function showMigrationStatus(): void {
  const status = runPrisma(['migrate', 'status']);
  assertSuccessful(status, 'Prisma migrate status');
  process.stdout.write(status.output);
}

async function main(): Promise<void> {
  const url = localDatabaseUrl();
  const databaseUrl = url.toString();
  process.env.DIRECT_URL = databaseUrl;

  const initial = runPrisma(['migrate', 'deploy']);
  if (initial.status === 0) {
    showMigrationStatus();
    return;
  }
  if (!initial.output.includes(TEDX_SCOPE_MIGRATION) ||
      !initial.output.includes('TEDxUCB event (slug=tedxucb) is missing')) {
    assertSuccessful(initial, 'Prisma migrate deploy');
    return;
  }

  // A blank local database has no TEDx row to serve as the legacy-data
  // backfill anchor. Recover only this exact failure, and only when the
  // related tables are empty. Never apply this fallback to a remote host.
  await seedFreshTedxAfterCoreMigrations(databaseUrl);
  const resolved = runPrisma(['migrate', 'resolve', '--rolled-back', TEDX_SCOPE_MIGRATION]);
  assertSuccessful(resolved, 'Marking the expected local migration attempt rolled back');

  const completed = runPrisma(['migrate', 'deploy']);
  assertSuccessful(completed, 'Prisma migrate deploy after local TEDx bootstrap');
  process.stdout.write('Local migrations completed after creating the empty-database TEDx anchor.\n');
  showMigrationStatus();
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local migration bootstrap failed.'}\n`);
  process.exitCode = 1;
});
