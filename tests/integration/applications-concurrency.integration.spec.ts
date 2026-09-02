import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedApplication } from '../support/seed-speakers';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Concurrencia: doble conversión de la misma postulación (T074)', () => {
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
  });

  it('exactamente una conversión prospera; exactamente un Speaker nuevo queda creado', async () => {
    const admin = await seedUser({ email: 'admin-concurrency@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const application = await seedApplication({
      status: 'ACCEPTED',
      reviewedById: admin.id,
      reviewedAt: new Date(),
    });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/applications/${application.id}/convert-to-speaker`)
        .set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer())
        .post(`/api/v1/applications/${application.id}/convert-to-speaker`)
        .set('Authorization', `Bearer ${token}`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const speakerCount = await prismaTestClient.speaker.count();
    expect(speakerCount).toBe(1);
  });
});
