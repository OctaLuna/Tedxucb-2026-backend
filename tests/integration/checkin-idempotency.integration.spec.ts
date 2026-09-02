import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent } from '../support/seed-catalog';
import { seedActivity, seedActivityStaff } from '../support/seed-activities';
import { QrTokenService } from '../../src/modules/activities/qr-token.service';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

/**
 * T082 / skill pruebas: idempotencia. El escenario real de campo es que la
 * red del recinto falla justo después de que el servidor confirmó el
 * check-in, y el staff reintenta con el mismo QR. El índice único parcial
 * de attendances es lo que hace el reintento seguro: dispara antes que la
 * clave de idempotencia del libro mayor (mismo orden fijado en
 * contracts/checkin.md), así que el reintento nunca produce un segundo
 * abono aunque no reciba el 200 "silencioso" que un contrato ingenuo
 * prometería -- ver la nota de idempotencia reescrita en el contrato.
 */
describe('Idempotencia: reintento de check-in tras fallo de red (T082)', () => {
  let app: INestApplication;
  let qrTokenService: QrTokenService;

  beforeAll(async () => {
    app = await createTestApp();
    qrTokenService = app.get(QrTokenService);
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

  it('el reintento no duplica puntos: un solo point_transactions y el mismo total', async () => {
    const staff = await seedUser({ email: 'staff-idempotencia@ucb.edu.bo', roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const activity = await seedActivity({ pointsValue: 10 });
    await seedActivityStaff(activity.id, staff.id);
    const { user: student } = await seedStudent({ email: 'alumno-idempotencia@ucb.edu.bo' });
    const { token: qrToken } = qrTokenService.issue(student.id);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken });
    expect(first.status).toBe(201);

    // El staff, sin ver la respuesta por la caída de red, reintenta la
    // misma operación (mismo alumno, misma actividad).
    const retry = await request(app.getHttpServer())
      .post(`/api/v1/activities/${activity.id}/checkin`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qrToken: qrTokenService.issue(student.id).token });
    expect(retry.status).toBe(409);
    expect(retry.body.error).toBe('ALREADY_CHECKED_IN');

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(10);

    const transactions = await prismaTestClient.pointTransaction.findMany({ where: { studentId: student.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].points).toBe(10);
  });
});
