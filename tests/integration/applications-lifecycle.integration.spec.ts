import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedEvent } from '../support/seed-content';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Historia 4 completa: postulación -> panel -> conversión (T073)', () => {
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

  it('postulación pública -> aparece en el panel -> se acepta -> se convierte sin recapturar datos', async () => {
    const admin = await seedUser({ email: 'admin-app-lifecycle@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const submitted = await request(app.getHttpServer()).post('/api/v1/public/applications').send({
      fullName: 'Postulante Historia 4',
      email: 'historia4@ejemplo.com',
      affiliation: 'Organización Z',
      expertiseArea: 'Gobernanza',
      ideaTitle: 'Gobernanza participativa',
      ideaSummary: 'Un modelo replicable de gobernanza.',
      evidenceBasis: 'Estudio de caso en 5 municipios.',
      applicability: 'Aplicable a cualquier gobierno local.',
    });
    expect(submitted.status).toBe(201);
    const applicationId = submitted.body.id;

    const panel = await request(app.getHttpServer())
      .get('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`);
    expect(panel.body.data.map((a: { id: string }) => a.id)).toContain(applicationId);

    const accepted = await request(app.getHttpServer())
      .patch(`/api/v1/applications/${applicationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACCEPTED' });
    expect(accepted.status).toBe(200);

    const converted = await request(app.getHttpServer())
      .post(`/api/v1/applications/${applicationId}/convert-to-speaker`)
      .set('Authorization', `Bearer ${token}`);
    expect(converted.status).toBe(201);
    expect(converted.body).toMatchObject({
      fullName: 'Postulante Historia 4',
      talkTitle: 'Gobernanza participativa',
      headline: 'Organización Z',
      bio: 'Un modelo replicable de gobernanza.',
      status: 'DRAFT',
    });
  });
});
