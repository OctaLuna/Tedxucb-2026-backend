import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';

async function loginAs(app: INestApplication, email: string, password = 'unaClaveSegura9') {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  return response.body.accessToken as string;
}

describe('Usuarios, roles y última administración (contrato)', () => {
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

  it('POST /users da de alta staff en INVITED y emite invitación', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Staff Nuevo', email: 'staff@ucb.edu.bo', roles: ['STAFF'] });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'INVITED', roles: ['STAFF'] });

    const invitation = await prismaTestClient.authToken.findFirst({
      where: { userId: response.body.id, type: 'INVITATION' },
    });
    expect(invitation).not.toBeNull();
  });

  it('POST /users rechaza con 409 DUPLICATE_FIELD un correo ya existente', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedUser({ email: 'ya-existe@ucb.edu.bo' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Cualquiera', email: 'ya-existe@ucb.edu.bo', roles: ['STAFF'] });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('DUPLICATE_FIELD');
  });

  it('GET /users rechaza a un STAFF (solo ADMIN)', async () => {
    const staff = await seedUser({ email: 'soystaff@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('otorgar y retirar un rol adicional preserva el resto (Historia 4)', async () => {
    const admin = await seedUser({ email: 'admin3@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const alumno = await seedUser({ email: 'alumno-staff@ucb.edu.bo', roles: ['ALUMNO'] });

    const granted = await request(app.getHttpServer())
      .post(`/api/v1/users/${alumno.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'STAFF' });
    expect(granted.status).toBe(200);
    expect(granted.body.roles.sort()).toEqual(['ALUMNO', 'STAFF']);

    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/users/${alumno.id}/roles/STAFF`)
      .set('Authorization', `Bearer ${token}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.roles).toEqual(['ALUMNO']);
  });

  it('rechaza con 409 LAST_ADMIN_STANDING retirar el rol del único administrador activo', async () => {
    const admin = await seedUser({ email: 'unico@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/users/${admin.id}/roles/ADMIN`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('LAST_ADMIN_STANDING');
  });

  it('rechaza con 409 LAST_ADMIN_STANDING deshabilitar al único administrador activo', async () => {
    const admin = await seedUser({ email: 'unico2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/users/${admin.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('LAST_ADMIN_STANDING');
  });

  it('deshabilitar con un segundo administrador presente preserva el historial (RF-118)', async () => {
    const admin1 = await seedUser({ email: 'admin4@ucb.edu.bo', roles: ['ADMIN'] });
    await seedUser({ email: 'admin5@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin1.email);
    const staff = await seedUser({ email: 'staff-a-deshabilitar@ucb.edu.bo', roles: ['STAFF'] });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/users/${staff.id}/disable`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('DISABLED');

    const stillThere = await prismaTestClient.user.findUnique({ where: { id: staff.id } });
    expect(stillThere).not.toBeNull();
  });
});
