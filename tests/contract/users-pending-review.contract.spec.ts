import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Revisión de registros pendientes (contrato, RF-126)', () => {
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

  it('GET /students/pending lista solo cuentas PENDING auto-registradas', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: pendiente } = await seedStudent({ email: 'pendiente@ucb.edu.bo', status: 'PENDING' });
    await seedStudent({ email: 'activo@ucb.edu.bo', status: 'ACTIVE' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/students/pending')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(pendiente.id);
  });

  it('aprobar activa la cuenta y permite iniciar sesión', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: pendiente } = await seedStudent({ email: 'aprobar@ucb.edu.bo', status: 'PENDING' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/students/${pendiente.id}/approve`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ACTIVE');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'aprobar@ucb.edu.bo', password: 'unaClaveSegura9' });
    expect(login.status).toBe(200);
  });

  it('rechazar exige motivo y bloquea el login posterior', async () => {
    const admin = await seedUser({ email: 'admin3@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: pendiente } = await seedStudent({ email: 'rechazar@ucb.edu.bo', status: 'PENDING' });

    const missingReason = await request(app.getHttpServer())
      .post(`/api/v1/students/${pendiente.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missingReason.status).toBe(400);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/students/${pendiente.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Código de registro no coincide con el carnet.' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('REJECTED');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'rechazar@ucb.edu.bo', password: 'unaClaveSegura9' });
    expect(login.status).toBe(403);
  });

  it('rechaza con 409 NOT_PENDING_REVIEW aprobar una cuenta que no está pendiente', async () => {
    const admin = await seedUser({ email: 'admin4@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: activo } = await seedStudent({ email: 'ya-activo@ucb.edu.bo', status: 'ACTIVE' });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/students/${activo.id}/approve`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('NOT_PENDING_REVIEW');
  });

  it('un STAFF no puede acceder a la revisión de pendientes (RF-115, mismo criterio)', async () => {
    const staff = await seedUser({ email: 'staff@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/students/pending')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
