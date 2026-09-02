import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedStudent, seedCareer } from '../support/seed-catalog';
import { TokenPairService } from '../../src/modules/auth/token-pair.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

/**
 * Login vía HTTP exige status ACTIVE (AuthService.login rechaza con 403
 * ACCOUNT_NOT_ACTIVE). Para probar el camino PENDING hace falta emitir el
 * token directo, sin pasar por el endpoint de login.
 */
async function tokenForPendingUser(app: INestApplication, userId: string) {
  const tokenPair = app.get(TokenPairService);
  const { accessToken } = await tokenPair.issue({ id: userId, status: 'PENDING', roles: ['ALUMNO'] });
  return accessToken;
}

describe('GET/PATCH /api/v1/me/profile (contrato)', () => {
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

  it('devuelve el perfil propio con carrera y facultad resueltas', async () => {
    const { user } = await seedStudent({ email: 'yo@ucb.edu.bo', studentCode: 'CODE-1' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      studentCode: 'CODE-1',
      career: expect.any(String),
      faculty: expect.any(String),
    });
  });

  it('actualiza campos opcionales (bio, intereses, teléfono)', async () => {
    const { user } = await seedStudent({ email: 'yo2@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'Estudiante de sistemas.', interests: ['IA', 'Robótica'], phone: '+59171111111' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      bio: 'Estudiante de sistemas.',
      interests: ['IA', 'Robótica'],
      phone: '+59171111111',
    });
  });

  it('rechaza con 403 FIELD_LOCKED editar studentCode con la cuenta ACTIVE', async () => {
    const { user } = await seedStudent({ email: 'activo@ucb.edu.bo', status: 'ACTIVE' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentCode: 'OTRO-CODIGO' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'FIELD_LOCKED', details: { field: 'studentCode' } });
  });

  it('rechaza con 403 FIELD_LOCKED editar careerId con la cuenta ACTIVE', async () => {
    const { user } = await seedStudent({ email: 'activo2@ucb.edu.bo', status: 'ACTIVE' });
    const token = await loginAs(app, user.email);
    const { career } = await seedCareer();

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ careerId: career.id });

    expect(response.status).toBe(403);
    expect(response.body.details.field).toBe('careerId');
  });

  it('permite editar studentCode/careerId libremente mientras PENDING', async () => {
    const { user } = await seedStudent({ email: 'pendiente@ucb.edu.bo', status: 'PENDING', studentCode: 'VIEJO' });
    const token = await tokenForPendingUser(app, user.id);
    const { career: nuevaCarrera } = await seedCareer({ careerName: 'Nueva carrera' });

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentCode: 'NUEVO-CODIGO', careerId: nuevaCarrera.id });

    expect(response.status).toBe(200);
    expect(response.body.studentCode).toBe('NUEVO-CODIGO');
    expect(response.body.career).toBe('Nueva carrera');
  });

  it('rechaza con 422 INVALID_CAREER una carrera inexistente mientras PENDING', async () => {
    const { user } = await seedStudent({ email: 'pendiente2@ucb.edu.bo', status: 'PENDING' });
    const token = await tokenForPendingUser(app, user.id);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ careerId: '00000000-0000-0000-0000-000000000000' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_CAREER');
  });

  it('rechaza con 409 DUPLICATE_FIELD un studentCode ya usado por otro alumno mientras PENDING', async () => {
    await seedStudent({ email: 'otro@ucb.edu.bo', studentCode: 'YA-EXISTE' });
    const { user } = await seedStudent({ email: 'pendiente3@ucb.edu.bo', status: 'PENDING', studentCode: 'PROPIO' });
    const token = await tokenForPendingUser(app, user.id);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ studentCode: 'YA-EXISTE' });

    expect(response.status).toBe(409);
    expect(response.body.details.field).toBe('studentCode');

    const unchanged = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(unchanged.studentCode).toBe('PROPIO');
  });

  it('rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me/profile');
    expect(response.status).toBe(401);
  });
});
