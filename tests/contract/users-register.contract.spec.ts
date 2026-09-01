import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedCareer, seedConsentVersion } from '../support/seed-catalog';
import { seedUser } from '../support/seed-user';

/**
 * Solo siembra carrera/versión de consentimiento nuevas si `overrides` no
 * ya trae una -- reutilizar dentro de un mismo test evita chocar contra el
 * índice único parcial `one_active_consent_version` (una segunda versión
 * activa) cuando el test arma dos payloads (p. ej. para probar duplicados).
 */
async function validPayload(overrides: Record<string, unknown> = {}) {
  const careerId = overrides.careerId ?? (await seedCareer()).career.id;
  const consentVersionId = overrides.consentVersionId ?? (await seedConsentVersion()).id;
  return {
    fullName: 'María Fernanda Quispe Aliaga',
    email: 'maria.quispe@ucb.edu.bo',
    studentCode: `202012345-${Date.now()}-${Math.random()}`,
    careerId,
    academicPeriod: '5to semestre',
    phone: '+59170012345',
    password: 'unaClaveSegura9',
    consentVersionId,
    ...overrides,
  };
}

describe('POST /api/v1/auth/register (contrato)', () => {
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

  it('crea la cuenta en PENDING y no emite ningún token de sesión', async () => {
    const payload = await validPayload();

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'PENDING', email: payload.email });
    expect(response.body.accessToken).toBeUndefined();

    const user = await prismaTestClient.user.findUnique({ where: { email: payload.email } });
    expect(user?.status).toBe('PENDING');
    expect(user?.registrationSource).toBe('SELF_REGISTRATION');

    const profile = await prismaTestClient.studentProfile.findUnique({ where: { userId: user!.id } });
    expect(profile?.studentCode).toBe(payload.studentCode);

    const verificationToken = await prismaTestClient.authToken.findFirst({
      where: { userId: user!.id, type: 'EMAIL_VERIFICATION' },
    });
    expect(verificationToken).not.toBeNull();
  });

  it('rechaza con 400 VALIDATION_ERROR un campo obligatorio faltante', async () => {
    const payload = await validPayload();
    const { phone: _phone, ...withoutPhone } = payload;

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(withoutPhone);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('rechaza con 422 EMAIL_DOMAIN_NOT_ALLOWED un correo no institucional', async () => {
    const payload = await validPayload({ email: 'maria@gmail.com' });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it('rechaza con 422 INVALID_CAREER una carrera inexistente', async () => {
    const payload = await validPayload({ careerId: '00000000-0000-0000-0000-000000000000' });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_CAREER');
  });

  it('rechaza con 410 CONSENT_VERSION_OUTDATED una versión de consentimiento que ya no es la activa', async () => {
    const outdated = await seedConsentVersion({ active: false });
    const payload = await validPayload({ consentVersionId: outdated.id });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('CONSENT_VERSION_OUTDATED');
  });

  it('rechaza con 409 DUPLICATE_FIELD un correo ya registrado, sin revelar datos del titular', async () => {
    const payload = await validPayload();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    const second = await validPayload({
      email: payload.email,
      careerId: payload.careerId,
      consentVersionId: payload.consentVersionId,
    });
    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(second);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'DUPLICATE_FIELD', details: { field: 'email' } });
    expect(JSON.stringify(response.body)).not.toContain('María');
  });

  it('rechaza con 409 DUPLICATE_FIELD un correo duplicado en cualquier estado (rechazado no libera el valor)', async () => {
    const payload = await validPayload();
    await seedUser({ email: payload.email, status: 'REJECTED', registrationSource: 'SELF_REGISTRATION' });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(payload);

    expect(response.status).toBe(409);
    expect(response.body.details.field).toBe('email');
  });

  it('rechaza con 409 DUPLICATE_FIELD un código de registro ya usado', async () => {
    const first = await validPayload();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(first);

    const second = await validPayload({
      email: `otra-${Date.now()}@ucb.edu.bo`,
      studentCode: first.studentCode,
      careerId: first.careerId,
      consentVersionId: first.consentVersionId,
    });
    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(second);

    expect(response.status).toBe(409);
    expect(response.body.details.field).toBe('studentCode');
  });

  it('dos registros concurrentes con el mismo correo: solo uno prospera (201), el otro 409', async () => {
    const payload = await validPayload();
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/register').send(payload),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...payload, studentCode: `${payload.studentCode}-b` }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
