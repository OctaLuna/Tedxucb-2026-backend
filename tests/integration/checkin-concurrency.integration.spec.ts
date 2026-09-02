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
 * T081 / skill pruebas: "las tres pruebas que este proyecto no puede no
 * tener" -- concurrencia. Peticiones REALMENTE simultáneas (Promise.all),
 * no una tras otra. Si ambas prosperan, la protección está en el código de
 * aplicación y tiene condición de carrera (Artículo IX: solo se prueba de
 * verdad contra Postgres real).
 */
describe('Concurrencia: dos check-ins simultáneos del mismo alumno (T081)', () => {
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

  it('exactamente uno prospera; el puntaje refleja un solo abono', async () => {
    const staffA = await seedUser({ email: 'staff-concurrencia-a@ucb.edu.bo', roles: ['STAFF'] });
    const admin = await seedUser({ email: 'admin-concurrencia@ucb.edu.bo', roles: ['ADMIN'] });
    const tokenA = await loginAs(app, staffA.email);
    const tokenAdmin = await loginAs(app, admin.email);
    const activity = await seedActivity({ pointsValue: 10 });
    await seedActivityStaff(activity.id, staffA.id);
    await seedActivityStaff(activity.id, admin.id);
    const { user: student } = await seedStudent({ email: 'alumno-concurrencia@ucb.edu.bo' });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/checkin`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ qrToken: qrTokenService.issue(student.id).token }),
      request(app.getHttpServer())
        .post(`/api/v1/activities/${activity.id}/checkin`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ qrToken: qrTokenService.issue(student.id).token }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: student.id } });
    expect(profile.totalPoints).toBe(10);

    const attendances = await prismaTestClient.attendance.count({
      where: { activityId: activity.id, studentId: student.id, status: { not: 'REJECTED' } },
    });
    expect(attendances).toBe(1);
  });
});
