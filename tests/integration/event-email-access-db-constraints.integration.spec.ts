import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';

describe('Restricciones de whitelist por evento (RF-503/504)', () => {
  beforeEach(async () => {
    await cleanAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function createEvent(name: string) {
    const event = await prismaTestClient.event.create({ data: { name, startsAt: new Date('2027-01-01T12:00:00Z') } });
    const slug = name === 'TEDxUCB' ? 'tedxucb' : name === 'Innovation Week' ? 'innovation-week' : null;
    const slugColumn = await prismaTestClient.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'slug') AS exists",
    );
    if (slug && slugColumn[0]?.exists) {
      await prismaTestClient.$executeRawUnsafe('UPDATE events SET slug = $1 WHERE id = $2', slug, event.id);
    }
    return event;
  }

  it('permite el mismo correo en eventos distintos y mantiene una fila por par correo-evento', async () => {
    const eventA = await createEvent('TEDxUCB');
    const eventB = await createEvent('Innovation Week');
    await prismaTestClient.$executeRawUnsafe(
      'INSERT INTO event_email_access (email_normalized, event_id) VALUES ($1, $2), ($1, $3)',
      'persona@example.net', eventA.id, eventB.id,
    );

    const rows = await prismaTestClient.$queryRawUnsafe<Array<{ event_id: string }>>(
      'SELECT event_id::text AS event_id FROM event_email_access WHERE email_normalized = $1 ORDER BY event_id',
      'persona@example.net',
    );
    expect(rows.map((row) => row.event_id).sort()).toEqual([eventA.id, eventB.id].sort());
  });

  it('la restricción única rechaza un duplicado del mismo correo normalizado y evento', async () => {
    const event = await createEvent('TEDxUCB');
    await prismaTestClient.$executeRawUnsafe(
      'INSERT INTO event_email_access (email_normalized, event_id) VALUES ($1, $2)',
      'persona@example.net', event.id,
    );

    await expect(prismaTestClient.$executeRawUnsafe(
      'INSERT INTO event_email_access (email_normalized, event_id) VALUES ($1, $2)',
      'persona@example.net', event.id,
    )).rejects.toThrow();
  });

  it('una autorización requiere que exista el evento referenciado', async () => {
    const missingEventId = '00000000-0000-0000-0000-000000000000';
    await expect(prismaTestClient.$executeRawUnsafe(
      'INSERT INTO event_email_access (email_normalized, event_id) VALUES ($1, $2)',
      'persona@example.net', missingEventId,
    )).rejects.toThrow();
  });
});
