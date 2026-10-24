import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const baselineEnd = '20261023040000_scope_content_blocks_to_event';

function localConnectionUrl() {
  const url = new URL(process.env.DIRECT_URL ?? 'postgresql://ted_test:local_test_only@127.0.0.1:55432/ted_backend_local?schema=public');
  const database = url.pathname.slice(1);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase()) || url.port !== '55432' || !database.startsWith('ted_')) {
    throw new Error('Migration fixture test is restricted to a ted_* database on loopback port 55432.');
  }
  url.pathname = '/ted_backend_local';
  url.search = '?schema=public';
  url.hash = '';
  return url;
}

function databaseUrl(base, databaseName) {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  url.search = '?schema=public';
  return url.toString();
}

function runPrisma(configPath, args, url) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--config', configPath], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@');
    throw new Error(`Prisma ${args[0]} failed with exit ${result.status ?? 'unknown'}:\n${output}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function runDocker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed:\n${result.stderr ?? result.stdout ?? ''}`);
  return result.stdout ?? '';
}

function postgresTestContainer() {
  const result = runDocker(['ps', '--filter', 'label=com.docker.compose.service=postgres-test', '--format', '{{.Names}}']);
  const containers = result.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (containers.length !== 1) throw new Error('Expected exactly one local postgres-test container for the sanitized dump fixture.');
  return containers[0];
}

async function dumpAndRestore(container, sourceDatabase, targetDatabase, tempRoot) {
  const containerArchive = `/tmp/${sourceDatabase}.dump`;
  const hostArchive = path.join(tempRoot, 'sanitized-legacy.dump');
  try {
    runDocker(['exec', '-e', 'PGPASSWORD=local_test_only', container, 'pg_dump', '-U', 'ted_test', '-d', sourceDatabase, '--format=custom', '--no-owner', '--no-acl', '-f', containerArchive]);
    runDocker(['cp', `${container}:${containerArchive}`, hostArchive]);
    runDocker(['cp', hostArchive, `${container}:${containerArchive}`]);
    runDocker(['exec', '-e', 'PGPASSWORD=local_test_only', container, 'pg_restore', '-U', 'ted_test', '-d', targetDatabase, '--no-owner', '--no-acl', containerArchive]);
  } finally {
    try { runDocker(['exec', container, 'rm', '-f', containerArchive]); } catch { /* cleanup is best-effort; DB cleanup remains authoritative */ }
    // The host copy contains only synthetic migration fixture values.
    await rm(hostArchive, { force: true });
  }
}

function expectPrismaFailure(configPath, args, url, expectedMessage) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--config', configPath], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@');
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(`Prisma did not reject the ambiguous legacy fixture as expected (exit ${result.status ?? 'unknown'}):\n${output}`);
  }
}

async function copyMigrationRange(source, target, predicate) {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory() && predicate(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    await cp(path.join(source, entry.name), path.join(target, entry.name), { recursive: true });
  }
}

async function createFixture(client, ids) {
  await client.query('BEGIN');
  try {
    await client.query("INSERT INTO events(id,name,starts_at,status,slug,capacity) VALUES($1,'TEDxUCB','2026-11-09T14:00:00Z','PUBLISHED',NULL,100)", [ids.event]);
    await client.query("INSERT INTO users(id,email,password_hash,full_name,status,registration_source) VALUES($1,'admin.fixture@example.test','fixture-hash','Fixture Admin','ACTIVE','ADMIN_CREATED'),($2,'student.fixture@example.test','fixture-hash','Fixture Student','ACTIVE','ADMIN_CREATED')", [ids.admin, ids.student]);
    await client.query("INSERT INTO faculties(id,name) VALUES($1,'Migration Fixture Faculty')", [ids.faculty]);
    await client.query("INSERT INTO careers(id,faculty_id,name) VALUES($1,$2,'Migration Fixture Career')", [ids.career, ids.faculty]);
    await client.query("INSERT INTO student_profiles(user_id,student_code,career_id,academic_period,phone,total_points) VALUES($1,'MIG-FIXTURE-001',$2,'2026-2','0000000',13)", [ids.student, ids.career]);
    await client.query("INSERT INTO content_blocks(id,key,title,body,updated_by) VALUES($1,'legacy_home','Legacy Home','Fixture body',$2)", [ids.content, ids.admin]);
    await client.query("INSERT INTO speakers(id,full_name,status,created_by) VALUES($1,'Fixture Speaker','DRAFT',$2)", [ids.speaker, ids.admin]);
    await client.query("INSERT INTO speaker_applications(id,full_name,email,affiliation,expertise_area,idea_title,idea_summary,evidence_basis,applicability) VALUES($1,'Fixture Applicant','speaker.fixture@example.test','UCB','Technology','Fixture Talk','A fixture idea','Evidence','Local applicability')", [ids.application]);
    await client.query("INSERT INTO activity_categories(id,name,color,suggested_points) VALUES($1,'Fixture Category','#123456',10)", [ids.category]);
    await client.query("INSERT INTO activities(id,category_id,title,points_value,starts_at,ends_at,checkin_opens_at,checkin_closes_at,created_by,status) VALUES($1,$2,'Fixture Activity',10,'2026-11-09T15:00:00Z','2026-11-09T16:00:00Z','2026-11-09T14:45:00Z','2026-11-09T15:45:00Z',$3,'PUBLISHED')", [ids.activity, ids.category, ids.admin]);
    await client.query("INSERT INTO point_transactions(id,student_id,points,type,activity_id,reason,created_by) VALUES($1,$2,10,'ACTIVITY',$3,NULL,$4),($5,$2,3,'ADJUSTMENT',NULL,'legacy manual adjustment',$4)", [ids.pointActivity, ids.student, ids.activity, ids.admin, ids.pointAdjustment]);
    await client.query("INSERT INTO selection_runs(id,event_id,executed_by,student_capacity_snapshot) VALUES($1,$2,$3,1)", [ids.run, ids.event, ids.admin]);
    await client.query("INSERT INTO selections(id,run_id,source,student_id,points_at_selection,rank_at_selection,entry_code) VALUES($1,$2,'RANKING',$3,13,1,'MIG-FIXTURE-ENTRY')", [ids.selection, ids.run, ids.student]);
    const ledger = await client.query('SELECT * FROM point_transactions ORDER BY id');
    const ledgerHash = createHash('sha256').update(JSON.stringify(ledger.rows)).digest('hex');
    await client.query('COMMIT');
    return { ledgerHash, ledgerRows: ledger.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function verifyRestoredBaseline(client, ids, snapshot) {
  const result = await client.query(`SELECT
    (SELECT count(*) FROM events WHERE id=$1 AND slug IS NULL) AS event,
    (SELECT count(*) FROM users) AS users,
    (SELECT count(*) FROM student_profiles WHERE user_id=$2 AND career_id=$3) AS profile,
    (SELECT count(*) FROM content_blocks WHERE id=$4 AND updated_by=$5) AS content,
    (SELECT count(*) FROM speakers WHERE id=$6 AND created_by=$5) AS speaker,
    (SELECT count(*) FROM speaker_applications WHERE id=$7) AS application,
    (SELECT count(*) FROM activity_categories WHERE id=$8) AS category,
    (SELECT count(*) FROM activities WHERE id=$9 AND category_id=$8 AND created_by=$5) AS activity,
    (SELECT count(*) FROM point_transactions WHERE student_id=$2) AS ledger_rows,
    (SELECT coalesce(sum(points),0) FROM point_transactions WHERE student_id=$2) AS ledger_sum,
    (SELECT count(*) FROM selection_runs WHERE id=$10 AND event_id=$1 AND executed_by=$5) AS selection_run,
    (SELECT count(*) FROM selections WHERE id=$11 AND run_id=$10 AND student_id=$2) AS selection`,
  [ids.event, ids.student, ids.career, ids.content, ids.admin, ids.speaker, ids.application, ids.category, ids.activity, ids.run, ids.selection]);
  const row = result.rows[0];
  const expected = { event: 1, users: 2, profile: 1, content: 1, speaker: 1, application: 1, category: 1, activity: 1, ledger_rows: snapshot.ledgerRows, ledger_sum: 13, selection_run: 1, selection: 1 };
  for (const [field, value] of Object.entries(expected)) {
    if (Number(row[field]) !== value) throw new Error(`Sanitized dump did not preserve the expected ${field} count or relation.`);
  }
  const ledger = await client.query('SELECT * FROM point_transactions ORDER BY id');
  const ledgerHash = createHash('sha256').update(JSON.stringify(ledger.rows)).digest('hex');
  if (ledgerHash !== snapshot.ledgerHash) throw new Error('Sanitized dump changed the immutable legacy ledger snapshot.');
}

async function expectRejected(client, sql, params, expected) {
  try {
    await client.query(sql, params);
  } catch (error) {
    if (String(error.message).includes(expected) || error.constraint === expected) return;
    throw error;
  }
  throw new Error(`Expected database to reject operation: ${expected}`);
}

async function verifyFixture(client, ids, snapshot) {
  const result = await client.query(`SELECT e.slug,
    (SELECT count(*) FROM content_blocks WHERE id=$2 AND event_id=$1) AS content,
    (SELECT count(*) FROM speakers WHERE id=$3 AND event_id=$1) AS speakers,
    (SELECT count(*) FROM speaker_applications WHERE id=$4 AND event_id=$1) AS applications,
    (SELECT count(*) FROM activity_categories WHERE id=$5 AND event_id=$1) AS categories,
    (SELECT count(*) FROM activities WHERE id=$6 AND event_id=$1) AS activities,
    (SELECT count(*) FROM selections WHERE id=$7 AND event_id=$1) AS selections,
    (SELECT count(*) FROM point_transaction_event_ownership WHERE event_id=$1) AS owners,
    (SELECT total_points FROM event_student_points WHERE event_id=$1 AND student_id=$8) AS projected_points
    FROM events e WHERE e.id=$1`, [ids.event, ids.content, ids.speaker, ids.application, ids.category, ids.activity, ids.selection, ids.student]);
  if (result.rowCount !== 1 || result.rows[0].slug !== 'tedxucb') throw new Error('TEDx slug backfill did not preserve the legacy event.');
  const row = result.rows[0];
  for (const field of ['content', 'speakers', 'applications', 'categories', 'activities', 'selections']) {
    if (Number(row[field]) !== 1) throw new Error(`Legacy ${field} row was not assigned to TEDx.`);
  }
  if (Number(row.owners) !== snapshot.ledgerRows || Number(row.projected_points) !== 13) throw new Error('Ledger ownership/projection backfill is incomplete.');

  const ledger = await client.query('SELECT * FROM point_transactions ORDER BY id');
  const ledgerHash = createHash('sha256').update(JSON.stringify(ledger.rows)).digest('hex');
  if (ledger.rows.length !== snapshot.ledgerRows || ledgerHash !== snapshot.ledgerHash) throw new Error('Migration changed legacy point_transactions rows.');
  const ownership = await client.query('SELECT point_transaction_id,event_id FROM point_transaction_event_ownership');
  if (ownership.rows.length !== snapshot.ledgerRows || ownership.rows.some((item) => item.event_id !== ids.event)) throw new Error('Legacy ledger ownership is not attributed to TEDx.');

  const innovation = await client.query("SELECT id FROM events WHERE slug='innovation-week'");
  if (innovation.rowCount !== 1) throw new Error('Innovation Week event was not seeded.');
  const weekId = innovation.rows[0].id;
  await client.query("INSERT INTO content_blocks(event_id,key,body) VALUES($1,'legacy_home','Innovation Week fixture')", [weekId]);
  await client.query("INSERT INTO activity_categories(event_id,name) VALUES($1,'Fixture Category')", [weekId]);
  await expectRejected(client, "INSERT INTO content_blocks(event_id,key,body) VALUES($1,'legacy_home','duplicate')", [weekId], 'content_blocks_event_id_key_key');
  await expectRejected(client, "INSERT INTO activity_categories(event_id,name) VALUES($1,'Fixture Category')", [weekId], 'activity_categories_event_id_name_key');
  await expectRejected(client, 'UPDATE selections SET event_id=$2 WHERE id=$1', [ids.selection, weekId], 'selections_run_id_event_id_fkey');
  await expectRejected(client, 'UPDATE activities SET category_id=$2,event_id=$3 WHERE id=$1', [ids.activity, ids.category, weekId], 'activities_category_id_event_id_fkey');
  await expectRejected(client, 'UPDATE point_transactions SET points=points+1 WHERE id=$1', [ids.pointActivity], 'point_transactions');
  await expectRejected(client, 'UPDATE point_transaction_event_ownership SET event_id=$2 WHERE point_transaction_id=$1', [ids.pointActivity, weekId], 'inmutable');

  const orphanCheck = await client.query(`SELECT
    (SELECT count(*) FROM content_blocks WHERE event_id IS NULL) +
    (SELECT count(*) FROM speakers WHERE event_id IS NULL) +
    (SELECT count(*) FROM speaker_applications WHERE event_id IS NULL) +
    (SELECT count(*) FROM activity_categories WHERE event_id IS NULL) +
    (SELECT count(*) FROM activities WHERE event_id IS NULL) +
    (SELECT count(*) FROM selections WHERE event_id IS NULL) AS scoped_orphans`);
  if (Number(orphanCheck.rows[0].scoped_orphans) !== 0) throw new Error('Scoped legacy data contains orphan rows.');
  return { events: 2, legacyRowsBackfilled: 7, ledgerRows: ledger.rows.length, ledgerHashUnchanged: true, crossEventConstraints: 'passed', scopedOrphans: 0, projectedPoints: Number(row.projected_points) };
}

async function main() {
  const baseUrl = localConnectionUrl();
  const sourceDatabaseName = `ted_migration_source_${Date.now()}_${process.pid}`;
  const databaseName = `ted_migration_fixture_${Date.now()}_${process.pid}`;
  const ambiguityDatabaseName = `ted_migration_collision_${Date.now()}_${process.pid}`;
  const safeSourceDatabaseName = /^ted_migration_source_[0-9]+_[0-9]+$/.test(sourceDatabaseName);
  const safeDatabaseName = /^ted_migration_fixture_[0-9]+_[0-9]+$/.test(databaseName);
  const safeAmbiguityDatabaseName = /^ted_migration_collision_[0-9]+_[0-9]+$/.test(ambiguityDatabaseName);
  if (!safeSourceDatabaseName || !safeDatabaseName || !safeAmbiguityDatabaseName) throw new Error('Generated fixture database name is invalid.');
  const adminClient = new Client({ connectionString: baseUrl.toString() });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ted-event-scope-migration-'));
  const configPath = path.join(root, `.prisma-migration-fixture-${process.pid}.tmp.config.ts`);
  const ambiguityConfigPath = path.join(root, `.prisma-migration-collision-${process.pid}.tmp.config.ts`);
  let sourceDatabaseCreated = false;
  let databaseCreated = false;
  let ambiguityDatabaseCreated = false;
  try {
    await adminClient.connect();
    const existing = await adminClient.query('SELECT 1 FROM pg_database WHERE datname=ANY($1)', [[sourceDatabaseName, databaseName]]);
    if (existing.rowCount) throw new Error('Generated migration fixture database already exists.');
    await adminClient.query(`CREATE DATABASE "${sourceDatabaseName}"`);
    sourceDatabaseCreated = true;

    const migrationRoot = path.join(tempRoot, 'migrations');
    await cp(path.join(root, 'prisma', 'schema.prisma'), path.join(tempRoot, 'schema.prisma'));
    await mkdir(migrationRoot, { recursive: true });
    await cp(path.join(root, 'prisma', 'migrations', 'migration_lock.toml'), path.join(migrationRoot, 'migration_lock.toml'));
    const migrations = path.join(root, 'prisma', 'migrations');
    await copyMigrationRange(migrations, migrationRoot, (name) => name < baselineEnd);
    const sourceUrl = databaseUrl(baseUrl, sourceDatabaseName);
    const config = `import { defineConfig, env } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(path.join(tempRoot, 'schema.prisma').replaceAll('\\', '/'))}, migrations: { path: ${JSON.stringify(migrationRoot.replaceAll('\\', '/'))} }, datasource: { url: env('DIRECT_URL') } });\n`;
    await writeFile(configPath, config, { encoding: 'utf8', flag: 'wx' });
    runPrisma(configPath, ['migrate', 'deploy'], sourceUrl);

    const ids = Object.fromEntries(['event','admin','student','faculty','career','content','speaker','application','category','activity','pointActivity','pointAdjustment','run','selection'].map((key, index) => [key, `21000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
    const fixtureClient = new Client({ connectionString: sourceUrl });
    await fixtureClient.connect();
    const snapshot = await createFixture(fixtureClient, ids);
    await fixtureClient.end();

    const targetExisting = await adminClient.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (targetExisting.rowCount) throw new Error('Generated restored fixture database already exists.');
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const fixtureUrl = databaseUrl(baseUrl, databaseName);
    const container = postgresTestContainer();
    await dumpAndRestore(container, sourceDatabaseName, databaseName, tempRoot);
    const sourceSnapshotClient = new Client({ connectionString: sourceUrl });
    await sourceSnapshotClient.connect();
    await verifyRestoredBaseline(sourceSnapshotClient, ids, snapshot);
    await sourceSnapshotClient.end();
    const restoredSnapshotClient = new Client({ connectionString: fixtureUrl });
    await restoredSnapshotClient.connect();
    await verifyRestoredBaseline(restoredSnapshotClient, ids, snapshot);
    await restoredSnapshotClient.end();

    await copyMigrationRange(migrations, migrationRoot, (name) => name >= baselineEnd);
    const deployLog = runPrisma(configPath, ['migrate', 'deploy'], fixtureUrl);
    if (!deployLog.includes('All migrations have been successfully applied.')) throw new Error('Prisma did not report a successful migration deploy.');
    const statusLog = runPrisma(configPath, ['migrate', 'status'], fixtureUrl);
    if (!statusLog.includes('Database schema is up to date!')) throw new Error('Fixture database has pending migrations.');

    const verifyClient = new Client({ connectionString: fixtureUrl });
    await verifyClient.connect();
    const result = await verifyFixture(verifyClient, ids, snapshot);
    await verifyClient.end();

    const preservedSourceClient = new Client({ connectionString: sourceUrl });
    await preservedSourceClient.connect();
    await verifyRestoredBaseline(preservedSourceClient, ids, snapshot);
    await preservedSourceClient.end();

    const ambiguityExisting = await adminClient.query('SELECT 1 FROM pg_database WHERE datname=$1', [ambiguityDatabaseName]);
    if (ambiguityExisting.rowCount) throw new Error('Generated ambiguity fixture database already exists.');
    await adminClient.query(`CREATE DATABASE "${ambiguityDatabaseName}"`);
    ambiguityDatabaseCreated = true;
    const ambiguityMigrationRoot = path.join(tempRoot, 'ambiguity-migrations');
    await mkdir(ambiguityMigrationRoot, { recursive: true });
    await cp(path.join(migrations, 'migration_lock.toml'), path.join(ambiguityMigrationRoot, 'migration_lock.toml'));
    await copyMigrationRange(migrations, ambiguityMigrationRoot, (name) => name < baselineEnd);
    const ambiguityConfig = `import { defineConfig, env } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(path.join(tempRoot, 'schema.prisma').replaceAll('\\', '/'))}, migrations: { path: ${JSON.stringify(ambiguityMigrationRoot.replaceAll('\\', '/'))} }, datasource: { url: env('DIRECT_URL') } });\n`;
    await writeFile(ambiguityConfigPath, ambiguityConfig, { encoding: 'utf8', flag: 'wx' });
    const ambiguityUrl = databaseUrl(baseUrl, ambiguityDatabaseName);
    runPrisma(ambiguityConfigPath, ['migrate', 'deploy'], ambiguityUrl);
    const ambiguityClient = new Client({ connectionString: ambiguityUrl });
    await ambiguityClient.connect();
    await ambiguityClient.query("INSERT INTO events(id,name,starts_at,status,capacity) VALUES ('22000000-0000-4000-8000-000000000001','TEDxUCB','2026-11-09T14:00:00Z','PUBLISHED',100),('22000000-0000-4000-8000-000000000002','TEDxUCB','2026-11-10T14:00:00Z','DRAFT',100)");
    const seededAmbiguousRows = await ambiguityClient.query("SELECT count(*) AS total,count(*) FILTER (WHERE slug IS NULL) AS without_slug FROM events WHERE name='TEDxUCB'");
    if (Number(seededAmbiguousRows.rows[0].total) !== 2 || Number(seededAmbiguousRows.rows[0].without_slug) !== 2) throw new Error('Could not seed the ambiguous TEDx legacy fixture.');
    await ambiguityClient.end();
    await copyMigrationRange(migrations, ambiguityMigrationRoot, (name) => name >= baselineEnd && name <= '20261023050000_backfill_legacy_event_slug');
    expectPrismaFailure(ambiguityConfigPath, ['migrate', 'deploy'], ambiguityUrl, 'found 2 legacy TEDxUCB events');
    const ambiguityVerifyClient = new Client({ connectionString: ambiguityUrl });
    await ambiguityVerifyClient.connect();
    const unchangedAmbiguousRows = await ambiguityVerifyClient.query("SELECT count(*) AS total, count(*) FILTER (WHERE slug IS NULL) AS without_slug FROM events WHERE name='TEDxUCB'");
    await ambiguityVerifyClient.end();
    if (Number(unchangedAmbiguousRows.rows[0].total) !== 2 || Number(unchangedAmbiguousRows.rows[0].without_slug) !== 2) {
      throw new Error('Ambiguous TEDx legacy rows were mutated instead of being preserved for manual resolution.');
    }
    process.stdout.write(`${JSON.stringify({ database: databaseName, baselineMigrations: 12, totalMigrations: 25, sanitizedDumpRestored: true, baselineRecoveryCopyPreserved: true, ambiguousLegacyRowsPreserved: true, ...result })}\n`);
  } finally {
    await rm(configPath, { force: true });
    await rm(ambiguityConfigPath, { force: true });
    for (const [name, created] of [[sourceDatabaseName, sourceDatabaseCreated], [databaseName, databaseCreated], [ambiguityDatabaseName, ambiguityDatabaseCreated]]) {
      if (!created) continue;
      try {
        await adminClient.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [name]);
        await adminClient.query(`DROP DATABASE "${name}"`);
      } catch (error) {
        process.stderr.write(`Cleanup required for local fixture database ${name}: ${error.message}\n`);
        throw error;
      }
    }
    await adminClient.end().catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
