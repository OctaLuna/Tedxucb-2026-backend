import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedCareer } from '../support/seed-catalog';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Catálogo de facultades y carreras (contrato, RF-116)', () => {
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

  it('GET /faculties y GET /careers son públicos, sin autenticación', async () => {
    await seedCareer({ facultyName: 'Facultad de Prueba', careerName: 'Carrera de Prueba' });

    const faculties = await request(app.getHttpServer()).get('/api/v1/faculties');
    const careers = await request(app.getHttpServer()).get('/api/v1/careers');

    expect(faculties.status).toBe(200);
    expect(careers.status).toBe(200);
    expect(careers.body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /faculties rechaza sin autenticación', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/faculties')
      .send({ name: 'Nueva Facultad' });
    expect(response.status).toBe(401);
  });

  it('ADMIN crea una facultad y luego una carrera dentro de ella', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const faculty = await request(app.getHttpServer())
      .post('/api/v1/faculties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Facultad Nueva' });
    expect(faculty.status).toBe(201);

    const career = await request(app.getHttpServer())
      .post('/api/v1/careers')
      .set('Authorization', `Bearer ${token}`)
      .send({ facultyId: faculty.body.id, name: 'Carrera Nueva' });
    expect(career.status).toBe(201);
  });

  it('rechaza con 409 DUPLICATE_CAREER una carrera repetida en la misma facultad', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { faculty } = await seedCareer({ careerName: 'Ya Existe' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/careers')
      .set('Authorization', `Bearer ${token}`)
      .send({ facultyId: faculty.id, name: 'Ya Existe' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('DUPLICATE_CAREER');
  });

  it('un STAFF no puede crear facultades ni carreras', async () => {
    const staff = await seedUser({ email: 'staff@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/faculties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Debería Crearse' });

    expect(response.status).toBe(403);
  });
});
