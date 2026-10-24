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

function payload(email: string) {
  return {
    fullName: 'Postulante Duplicado',
    email,
    affiliation: 'Empresa Duplicada',
    expertiseArea: 'Área',
    ideaTitle: 'Idea',
    ideaSummary: 'Resumen',
    evidenceBasis: 'Evidencia',
    applicability: 'Aplicabilidad',
  };
}

describe('Caso límite: misma persona postula varias veces (T075)', () => {
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

  it('no se bloquea el reenvío; el panel muestra submissionsFromSameEmail=2 sin distinguir mayúsculas', async () => {
    const admin = await seedUser({ email: 'admin-duplicates@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const first = await request(app.getHttpServer())
      .post('/api/v1/public/applications')
      .send(payload('mismo.correo@ejemplo.com'));
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/public/applications')
      .send(payload('Mismo.Correo@Ejemplo.com'));
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const panel = await request(app.getHttpServer())
      .get('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`);

    expect(panel.body.meta.total).toBe(2);
    for (const row of panel.body.data) {
      expect(row.submissionsFromSameEmail).toBe(2);
    }
  });
});
