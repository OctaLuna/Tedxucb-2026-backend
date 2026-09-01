import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { seedCareer, seedConsentVersion } from '../support/seed-catalog';
import { seedUser } from '../support/seed-user';

test.describe('users: auto-registro, verificación, revisión y alta de staff', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
  });

  test('ciclo completo de auto-registro: registro -> verificación -> activa -> login', async ({ request }) => {
    const { career } = await seedCareer();
    const consentVersion = await seedConsentVersion();
    const email = `e2e-registro-${Date.now()}@ucb.edu.bo`;

    const rejectedDomain = await request.post('/api/v1/auth/register', {
      data: {
        fullName: 'Alumno E2E',
        email: 'alumno@gmail.com',
        studentCode: `code-${Date.now()}`,
        careerId: career.id,
        academicPeriod: '3er semestre',
        phone: '+59170000000',
        password: 'unaClaveSegura9',
        consentVersionId: consentVersion.id,
      },
    });
    expect(rejectedDomain.status()).toBe(422);
    expect((await rejectedDomain.json()).error).toBe('EMAIL_DOMAIN_NOT_ALLOWED');

    const register = await request.post('/api/v1/auth/register', {
      data: {
        fullName: 'Alumno E2E',
        email,
        studentCode: `code-${Date.now()}`,
        careerId: career.id,
        academicPeriod: '3er semestre',
        phone: '+59170000000',
        password: 'unaClaveSegura9',
        consentVersionId: consentVersion.id,
      },
    });
    expect(register.status()).toBe(201);
    expect((await register.json()).status).toBe('PENDING');

    const loginBeforeVerify = await request.post('/api/v1/auth/login', {
      data: { email, password: 'unaClaveSegura9' },
    });
    expect(loginBeforeVerify.status()).toBe(403);

    const user = await prismaTestClient.user.findUniqueOrThrow({ where: { email } });
    const authToken = await prismaTestClient.authToken.findFirstOrThrow({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
    });

    // El endpoint nunca revela el token en claro (solo su hash se guarda) --
    // se sella la cuenta directo por Prisma para simular el clic real del
    // correo, y se prueba el propio endpoint por separado en Jest con el
    // token en claro capturado desde el servicio.
    expect(authToken).toBeTruthy();
    await prismaTestClient.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    await prismaTestClient.authToken.update({ where: { id: authToken.id }, data: { consumedAt: new Date() } });

    const loginAfterVerify = await request.post('/api/v1/auth/login', {
      data: { email, password: 'unaClaveSegura9' },
    });
    expect(loginAfterVerify.status()).toBe(200);
  });

  test('alta de staff por invitación hasta login exitoso (Historia 1b)', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const adminLogin = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken } = await adminLogin.json();

    const staffEmail = `e2e-staff-${Date.now()}@ucb.edu.bo`;
    const created = await request.post('/api/v1/users', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { fullName: 'Staff E2E', email: staffEmail, roles: ['STAFF'] },
    });
    expect(created.status()).toBe(201);
    const { id: staffId } = await created.json();

    const invitation = await prismaTestClient.authToken.findFirstOrThrow({
      where: { userId: staffId, type: 'INVITATION' },
    });
    // Mismo motivo que arriba: se activa directo por Prisma para simular
    // aceptar la invitación; accept-invitation ya se prueba en 001-b.
    await prismaTestClient.user.update({
      where: { id: staffId },
      data: { status: 'ACTIVE', passwordHash: (await prismaTestClient.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash },
    });
    await prismaTestClient.authToken.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } });

    const staffLogin = await request.post('/api/v1/auth/login', {
      data: { email: staffEmail, password: 'unaClaveSegura9' },
    });
    expect(staffLogin.status()).toBe(200);
    expect((await staffLogin.json()).user.roles).toEqual(['STAFF']);
  });
});
