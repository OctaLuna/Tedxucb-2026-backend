import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('GET /api/v1/me/progress (contrato, RF-342, T074)', () => {
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

  it('rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/progress');
    expect(response.status).toBe(401);
  });

  it('rechaza con 403 a un ADMIN sin rol ALUMNO', async () => {
    const admin = await seedUser({ email: `admin-progreso-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('devuelve totalPoints/rank/totalStudents, sin pointsToCutoff (resuelto 2026-09-02)', async () => {
    const { user: leader } = await seedStudent({ email: `lider-progreso-${Date.now()}@ucb.edu.bo` });
    const { user: second } = await seedStudent({ email: `segundo-progreso-${Date.now()}@ucb.edu.bo` });
    await prismaTestClient.pointTransaction.create({
      data: { studentId: leader.id, points: 50, type: 'BONUS', reason: 'seed' },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: leader.id }, data: { totalPoints: 50 } });
    await prismaTestClient.pointTransaction.create({
      data: { studentId: second.id, points: 20, type: 'BONUS', reason: 'seed' },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: second.id }, data: { totalPoints: 20 } });
    const token = await loginAs(app, second.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ totalPoints: 20, rank: 2, totalStudents: 2 });
    expect(response.body.pointsToCutoff).toBeUndefined();
  });

  it('un alumno deshabilitado a mitad de sesión (token de acceso corto, aún vigente) recibe rank null, no un error', async () => {
    // PENDING no llega a esta prueba: ni siquiera puede iniciar sesión
    // (403 ACCOUNT_NOT_ACTIVE, ver auth-login.contract.spec.ts). El caso
    // real y alcanzable es un admin deshabilitando a alguien mientras su
    // access token de 15 minutos sigue siendo válido -- no es revocable
    // dentro de esa ventana (skill seguridad-y-roles).
    const { user: student } = await seedStudent({ email: `deshabilitado-a-mitad-${Date.now()}@ucb.edu.bo` });
    const token = await loginAs(app, student.email);
    await prismaTestClient.user.update({ where: { id: student.id }, data: { status: 'DISABLED' } });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACCOUNT_NOT_ACTIVE');
  });
});
