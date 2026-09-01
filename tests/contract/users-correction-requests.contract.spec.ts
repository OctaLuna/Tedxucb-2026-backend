import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent, seedCareer } from '../support/seed-catalog';
import { OneTimeTokenService } from '../../src/modules/auth/one-time-token.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Solicitudes de corrección (contrato, RF-112a)', () => {
  let app: INestApplication;
  let oneTimeToken: OneTimeTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    oneTimeToken = app.get(OneTimeTokenService);
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

  it('el alumno crea una solicitud de corrección de studentCode', async () => {
    const { user } = await seedStudent({ email: 'yo@ucb.edu.bo', studentCode: 'CODE-1' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'studentCode', newValue: 'CODE-2', reason: 'Error de tipeo al registrarme.' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ field: 'studentCode', status: 'PENDING' });
  });

  it('rechaza una segunda solicitud pendiente para el mismo campo', async () => {
    const { user } = await seedStudent({ email: 'yo2@ucb.edu.bo' });
    const token = await loginAs(app, user.email);
    await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'careerId', newValue: 'x', reason: 'Motivo 1' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'careerId', newValue: 'y', reason: 'Motivo 2' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('CORRECTION_ALREADY_PENDING');
  });

  it('resolver una corrección de studentCode la aplica de inmediato, sin re-verificación', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const { user, studentProfile } = await seedStudent({ email: 'estudiante@ucb.edu.bo', studentCode: 'CODE-A' });
    const studentToken = await loginAs(app, user.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ field: 'studentCode', newValue: 'CODE-B', reason: 'Error de tipeo.' });

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/correction-requests/${created.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: true });

    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('RESOLVED');

    const updatedProfile = await prismaTestClient.studentProfile.findUniqueOrThrow({
      where: { userId: studentProfile.userId },
    });
    expect(updatedProfile.studentCode).toBe('CODE-B');
  });

  it('resolver una corrección de email NO sobrescribe el correo directo: emite un auth_tokens con new_email', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const { user } = await seedStudent({ email: 'correo-viejo@ucb.edu.bo' });
    const studentToken = await loginAs(app, user.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ field: 'email', newValue: 'correo-nuevo@ucb.edu.bo', reason: 'Cambié de correo institucional.' });

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/correction-requests/${created.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: true });
    expect(resolved.status).toBe(200);

    // El correo NO cambia todavía.
    const stillOld = await prismaTestClient.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stillOld.email).toBe('correo-viejo@ucb.edu.bo');

    const pendingToken = await prismaTestClient.authToken.findFirstOrThrow({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', consumedAt: null },
    });
    expect(pendingToken.newEmail).toBe('correo-nuevo@ucb.edu.bo');

    // Verificar el nuevo correo sí lo aplica.
    const { token } = await oneTimeToken.issue(
      { userId: user.id, type: 'EMAIL_VERIFICATION', newEmail: 'correo-nuevo@ucb.edu.bo' },
    );
    const verify = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);

    const updated = await prismaTestClient.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe('correo-nuevo@ucb.edu.bo');
  });

  it('rechazar una solicitud no aplica ningún cambio', async () => {
    const admin = await seedUser({ email: 'admin3@ucb.edu.bo', roles: ['ADMIN'] });
    const adminToken = await loginAs(app, admin.email);
    const { user, studentProfile } = await seedStudent({ email: 'estudiante2@ucb.edu.bo', studentCode: 'CODE-X' });
    const studentToken = await loginAs(app, user.email);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/correction-requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ field: 'studentCode', newValue: 'CODE-Y', reason: 'Motivo' });

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/correction-requests/${created.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: false, note: 'No corresponde.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('REJECTED');

    const unchanged = await prismaTestClient.studentProfile.findUniqueOrThrow({
      where: { userId: studentProfile.userId },
    });
    expect(unchanged.studentCode).toBe('CODE-X');
  });
});
