import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';
import { grantEventAccess } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

/**
 * No pedida por tasks.md de 004-a (T063 solo prueba secuencial), pero el
 * propio prompt de 004-b la exige explícitamente, mismo patrón que
 * checkin-concurrency.integration.spec.ts de 003-a: peticiones
 * REALMENTE simultáneas (Promise.all), no una tras otra.
 */
describe('Concurrencia: dos escaneos simultáneos de la misma entrada (RF-417)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    await seedEvent();
  });

  it('exactamente uno prospera; el otro recibe 409 ALREADY_USED', async () => {
    const admin = await seedUser({ email: `admin-scan-concurrencia-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const staffA = await seedUser({ email: `staff-scan-a-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    const staffB = await seedUser({ email: `staff-scan-b-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
    await grantEventAccess(staffA.email, 'tedxucb');
    await grantEventAccess(staffB.email, 'tedxucb');
    const tokenA = await loginAs(app, staffA.email);
    const tokenB = await loginAs(app, staffB.email);
    const { user: student } = await seedStudent({ email: `alumno-scan-concurrencia-${Date.now()}@ucb.edu.bo` });

    const created = await request(app.getHttpServer())
      .post('/api/v1/selection/manual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student.id, reason: 'motivo' });
    const entryCode = created.body.entryCode as string;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ entryCode }),
      request(app.getHttpServer())
        .post('/api/v1/entries/scan')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ entryCode }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const selection = await prismaTestClient.selection.findFirstOrThrow({ where: { entryCode } });
    expect(selection.entryUsedAt).not.toBeNull();
  });
});
