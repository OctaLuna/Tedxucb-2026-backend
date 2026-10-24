import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

async function seedEvent(name: string) {
  const [event] = await prismaTestClient.$queryRawUnsafe<Array<{ id: string }>>(
    'INSERT INTO events (name, starts_at) VALUES ($1, $2) RETURNING id::text AS id',
    name,
    new Date('2027-01-01T12:00:00Z'),
  );
  const slug = name === 'TEDxUCB' ? 'tedxucb' : name === 'Innovation Week' ? 'innovation-week' : null;
  const slugColumn = await prismaTestClient.$queryRawUnsafe<Array<{ exists: boolean }>>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'slug') AS exists",
  );
  if (slug && slugColumn[0]?.exists) {
    await prismaTestClient.$executeRawUnsafe('UPDATE events SET slug = $1 WHERE id = $2', slug, event.id);
  }
  const admins = await prismaTestClient.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
    select: { email: true },
  });
  if (admins.length) {
    await prismaTestClient.eventEmailAccess.createMany({
      data: admins.map(({ email }) => ({ emailNormalized: email, eventId: event.id })),
      skipDuplicates: true,
    });
  }
  return event;
}

describe('Whitelist administrativa por evento (contrato RF-503/504/515)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await prismaTestClient.$disconnect();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  it('GET lista y POST crea por defecto una autorización para ambos eventos', async () => {
    const admin = await seedUser({ email: 'admin-access@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const tedx = await seedEvent('TEDxUCB');
    const week = await seedEvent('Innovation Week');

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: ' PERSONA@Ejemplo.com ' });

    expect(created.status).toBe(201);
    expect(created.body.data).toHaveLength(2);
    expect(created.body.data.map((row: { eventId: string }) => row.eventId).sort()).toEqual([tedx.id, week.id].sort());
    expect(created.body.data.every((row: { emailNormalized: string }) => row.emailNormalized === 'persona@ejemplo.com')).toBe(true);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    const targetRows = listed.body.data.filter((row: { emailNormalized: string }) => row.emailNormalized === 'persona@ejemplo.com');
    expect(targetRows).toHaveLength(2);
    expect(targetRows.map((row: { id: string }) => row.id).sort()).toEqual(created.body.data.map((row: { id: string }) => row.id).sort());
    expect(await prismaTestClient.user.findUnique({ where: { email: 'persona@ejemplo.com' } })).toBeNull();
  });

  it('filtra por correo y pagina por correo sin separar los permisos de un mismo correo', async () => {
    const admin = await seedUser({ email: 'admin-filter@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const tedx = await seedEvent('TEDxUCB');
    const week = await seedEvent('Innovation Week');
    await prismaTestClient.eventEmailAccess.createMany({
      data: [
        { emailNormalized: 'alpha@example.net', eventId: tedx.id },
        { emailNormalized: 'alpha@example.net', eventId: week.id },
        { emailNormalized: 'beta@example.net', eventId: tedx.id },
        { emailNormalized: 'gamma@example.net', eventId: week.id },
      ],
    });
    await prismaTestClient.eventEmailAccess.update({
      where: { emailNormalized_eventId: { emailNormalized: 'alpha@example.net', eventId: week.id } },
      data: { revokedAt: new Date() },
    });

    const firstPage = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access?email=EXAMPLE.NET&status=all&limit=1&page=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(firstPage.body.meta).toEqual({ page: 1, limit: 1, total: 3, totalPages: 3 });
    expect(firstPage.body.data.map((row: { emailNormalized: string }) => row.emailNormalized)).toEqual([
      'alpha@example.net', 'alpha@example.net',
    ]);
    expect(firstPage.body.data.map((row: { eventId: string }) => row.eventId).sort()).toEqual([tedx.id, week.id].sort());

    const secondPage = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access?email=example.net&status=all&limit=1&page=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(secondPage.body.data.map((row: { emailNormalized: string }) => row.emailNormalized)).toEqual(['beta@example.net']);

    const active = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access?email=ALPHA&status=active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(active.body.data.map((row: { eventId: string }) => row.eventId)).toEqual([tedx.id]);

    const revoked = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access?email=alpha&status=revoked')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(revoked.body.data.map((row: { eventId: string }) => row.eventId)).toEqual([week.id]);
  });

  it('un POST reemplaza el conjunto de scopes previo para el mismo correo', async () => {
    const admin = await seedUser({ email: 'admin-scope@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const tedx = await seedEvent('TEDxUCB');
    const week = await seedEvent('Innovation Week');

    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'externo@example.net', eventIds: [tedx.id] });
    expect(first.status).toBe(201);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.data[0].eventId).toBe(tedx.id);

    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'EXTERNO@example.net', eventIds: [week.id] });
    expect(second.status).toBe(201);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].eventId).toBe(week.id);
    const listed = await request(app.getHttpServer()).get('/api/v1/admin/event-access?status=all').set('Authorization', `Bearer ${token}`);
    const targetRows = listed.body.data.filter((row: { emailNormalized: string }) => row.emailNormalized === 'externo@example.net');
    expect(targetRows.filter((row: { revokedAt: string | null }) => row.revokedAt === null)).toHaveLength(1);
    expect(targetRows.find((row: { eventId: string }) => row.eventId === tedx.id)?.revokedAt).toBeTruthy();
  });

  it('limita listado, grants y revocaciones al scope del administrador', async () => {
    const admin = await seedUser({ email: 'admin-one-event@example.net', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const tedx = await seedEvent('TEDxUCB');
    const week = await seedEvent('Innovation Week');
    await prismaTestClient.eventEmailAccess.updateMany({
      where: { emailNormalized: admin.email, eventId: week.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const tedxGrant = await prismaTestClient.eventEmailAccess.create({
      data: { emailNormalized: 'scoped-target@example.net', eventId: tedx.id },
    });
    const weekGrant = await prismaTestClient.eventEmailAccess.create({
      data: { emailNormalized: 'scoped-target@example.net', eventId: week.id },
    });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const targetRows = listed.body.data.filter((row: { emailNormalized: string }) => row.emailNormalized === 'scoped-target@example.net');
    expect(targetRows.map((row: { id: string }) => row.id)).toEqual([tedxGrant.id]);

    await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'scoped-target@example.net', eventIds: [tedx.id] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'scoped-target@example.net', eventIds: [week.id] })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/event-access/${weekGrant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const activeWeekGrant = await prismaTestClient.eventEmailAccess.findUniqueOrThrow({ where: { id: weekGrant.id } });
    expect(activeWeekGrant.revokedAt).toBeNull();
  });
  it('serializa dos reemplazos simultáneos del mismo correo sin dejar scopes duplicados o mezclados', async () => {
    const admin = await seedUser({ email: 'admin-concurrent-access@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const tedx = await seedEvent('TEDxUCB');
    const week = await seedEvent('Innovation Week');
    const headers = { Authorization: `Bearer ${token}` };

    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/admin/event-access').set(headers)
        .send({ email: 'race@example.net', eventIds: [tedx.id] }),
      request(app.getHttpServer()).post('/api/v1/admin/event-access').set(headers)
        .send({ email: 'RACE@example.net', eventIds: [week.id] }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const listed = await request(app.getHttpServer()).get('/api/v1/admin/event-access?status=all').set(headers);
    const active = listed.body.data.filter((row: { revokedAt: string | null }) => row.revokedAt === null);
    const targetRows = listed.body.data.filter((row: { emailNormalized: string }) => row.emailNormalized === 'race@example.net');
    const activeTargets = targetRows.filter((row: { revokedAt: string | null }) => row.revokedAt === null);
    expect(activeTargets).toHaveLength(1);
    expect([tedx.id, week.id]).toContain(activeTargets[0].eventId);
    expect(targetRows).toHaveLength(2);
    expect(new Set(targetRows.map((row: { id: string }) => row.id)).size).toBe(2);
  });

  it('rechaza evento inexistente sin guardar scopes parciales', async () => {
    const admin = await seedUser({ email: 'admin-invalid-event@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const event = await seedEvent('TEDxUCB');
    const missingId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'atomic@example.net', eventIds: [event.id, missingId] });

    expect([400, 404, 422]).toContain(response.status);
    expect(await prismaTestClient.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint AS count FROM event_email_access WHERE email_normalized = $1',
      'atomic@example.net',
    )).toEqual([{ count: 0n }]);
  });

  it('solo ADMIN puede consultar, crear y revocar; un STAFF recibe 403 en todos los métodos', async () => {
    const admin = await seedUser({ email: 'admin-ops@ucb.edu.bo', roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staff = await seedUser({ email: 'staff-ops@ucb.edu.bo', roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const event = await seedEvent('TEDxUCB');
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/event-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'revoke@example.net', eventIds: [event.id] });
    const rowId = created.body.data[0]?.id ?? '00000000-0000-0000-0000-000000000000';

    const list = await request(app.getHttpServer()).get('/api/v1/admin/event-access').set('Authorization', `Bearer ${staffToken}`);
    const add = await request(app.getHttpServer()).post('/api/v1/admin/event-access').set('Authorization', `Bearer ${staffToken}`).send({ email: 'nope@example.net' });
    const revoke = await request(app.getHttpServer()).delete(`/api/v1/admin/event-access/${rowId}`).set('Authorization', `Bearer ${staffToken}`);
    expect([list.status, add.status, revoke.status]).toEqual([403, 403, 403]);

    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/admin/event-access/${rowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoked.status).toBe(204);
    const stillListed = await request(app.getHttpServer()).get('/api/v1/admin/event-access?status=revoked').set('Authorization', `Bearer ${adminToken}`);
    expect(stillListed.body.data.find((row: { emailNormalized: string }) => row.emailNormalized === 'revoke@example.net')?.revokedAt).toBeTruthy();
  });

  it('vuelve a comprobar el rol ADMIN en base de datos después de emitir el token', async () => {
    const admin = await seedUser({ email: 'role-removed-access@ucb.edu.bo', roles: ['ADMIN'] });
    await seedUser({ email: 'second-admin-role-removed@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await prismaTestClient.userRole.delete({ where: { userId_role: { userId: admin.id, role: 'ADMIN' } } });

    const response = await request(app.getHttpServer()).get('/api/v1/admin/event-access').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('rechaza una cuenta ADMIN deshabilitada aunque conserve el rol', async () => {
    const disabledAdmin = await seedUser({ email: 'disabled-admin-access@ucb.edu.bo', roles: ['ADMIN'] });
    await seedUser({ email: 'second-admin-disabled-access@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, disabledAdmin.email);
    await prismaTestClient.user.update({ where: { id: disabledAdmin.id }, data: { status: 'DISABLED' } });
    const response = await request(app.getHttpServer()).get('/api/v1/admin/event-access').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });
});
