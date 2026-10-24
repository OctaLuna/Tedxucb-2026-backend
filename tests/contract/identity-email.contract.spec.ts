import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { GoogleAuthService } from '../../src/modules/auth/google-auth.service';
import { MailService } from '../../src/common/mail/mail.service';
import { hashToken } from '../../src/common/crypto/token-hash.util';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

function tokenFromSentLink(mail: jest.SpyInstance, kind: 'identity-invitation' | 'identity-email-verification') {
  const call = mail.mock.calls.find(([jobName]) => jobName === kind);
  expect(call).toBeDefined();
  const payload = call?.[1] as { to: string; url: string };
  const url = new URL(payload.url);
  const token = new URLSearchParams(url.hash.slice(1)).get(kind === 'identity-invitation' ? 'invitation' : 'emailVerification');
  expect(token).toBeTruthy();
  return { token: token!, payload };
}

describe('Invitaciones y prueba de titularidad de correo externo (RF-505/506)', () => {
  let app: INestApplication;
  let mailSend: jest.SpyInstance;
  let googleVerifier: jest.SpyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_CLIENT_ID = 'identity-email-contract-test-client';
    process.env.PUBLIC_FRONTEND_URL_TEDX = 'http://localhost:3000';
    process.env.PUBLIC_FRONTEND_URL_INNOVATION_WEEK = 'http://localhost:5173';
    app = await createTestApp();
    mailSend = jest.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    const google = (app.get(GoogleAuthService) as unknown as { google: { verifyIdToken: (...args: unknown[]) => unknown } }).google;
    googleVerifier = jest.spyOn(google, 'verifyIdToken');
  });

  afterAll(async () => {
    googleVerifier.mockRestore();
    mailSend.mockRestore();
    await app.close();
    await closeRedisTestClient();
    await prismaTestClient.$disconnect();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    mailSend.mockClear();
    googleVerifier.mockReset();
  });

  async function seedAuthorizedEmail(email: string, slug = 'innovation-week') {
    const event = await prismaTestClient.event.create({
      data: { name: slug === 'tedxucb' ? 'TEDxUCB' : 'Innovation Week', slug, startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    await prismaTestClient.eventEmailAccess.create({ data: { emailNormalized: email, eventId: event.id } });
    return event;
  }

  async function googleChallenge(email: string, subject: string) {
    const challenge = await request(app.getHttpServer()).post('/api/v1/auth/google/challenge');
    expect(challenge.status).toBe(200);
    // Install a verifier tied to the nonce returned by this challenge.
    googleVerifier.mockImplementation(async () => ({
      getPayload: () => ({ sub: subject, email, email_verified: true, nonce: challenge.body.nonce, name: 'Persona externa' }),
    }));
    return challenge.body.nonce as string;
  }

  it('el ADMIN invita solo un correo autorizado, guarda hash y crea enlace de un solo uso por tres días', async () => {
    await seedAuthorizedEmail('persona@example.net');
    const admin = await seedUser({ email: 'admin-identity-invite@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const before = Date.now();

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'PERSONA@Example.net', eventSlug: 'innovation-week' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SENT');
    const expiresAt = new Date(response.body.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + THREE_DAYS_MS - 5000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + THREE_DAYS_MS + 5000);
    const { token: rawToken, payload } = tokenFromSentLink(mailSend, 'identity-invitation');
    expect(payload.to).toBe('persona@example.net');
    expect(new URL(payload.url).origin).toBe('http://localhost:5173');
    const stored = await prismaTestClient.identityInvitation.findUniqueOrThrow({ where: { tokenHash: hashToken(rawToken) } });
    expect(stored.email).toBe('persona@example.net');
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.consumedAt).toBeNull();

    const consumed = await request(app.getHttpServer())
      .post('/api/v1/auth/identity-invitations/consume')
      .send({ token: rawToken });
    expect(consumed.status).toBe(200);
    expect(consumed.body).toEqual({ status: 'VALID' });
    expect(consumed.body.accessToken).toBeUndefined();
    expect((await prismaTestClient.identityInvitation.findUniqueOrThrow({ where: { id: stored.id } })).consumedAt).toBeTruthy();

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/identity-invitations/consume')
      .send({ token: rawToken });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('INVALID_EMAIL_LINK');

  });

  it('dirige la invitacion TEDx a su frontend y exige que el correo tenga ese scope', async () => {
    await seedAuthorizedEmail('tedx-only@example.net', 'tedxucb');
    await prismaTestClient.event.create({
      data: { name: 'Innovation Week', slug: 'innovation-week', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    const admin = await seedUser({ email: 'admin-event-target@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'tedx-only@example.net', eventSlug: 'tedxucb' });
    expect(response.status).toBe(200);
    const { payload } = tokenFromSentLink(mailSend, 'identity-invitation');
    expect(new URL(payload.url).origin).toBe('http://localhost:3000');

    const wrongScope = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'tedx-only@example.net', eventSlug: 'innovation-week' });
    expect(wrongScope.status).toBe(403);
    expect(wrongScope.body.error).toBe('EMAIL_NOT_AUTHORIZED');
    expect(mailSend).toHaveBeenCalledTimes(1);
  });

  it('vincula el token al evento y no lo acepta si ese scope se revoca aunque otro siga activo', async () => {
    const email = 'scope-bound-invitation@example.net';
    const tedx = await seedAuthorizedEmail(email, 'tedxucb');
    const innovation = await prismaTestClient.event.create({
      data: { name: 'Innovation Week', slug: 'innovation-week', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    await prismaTestClient.eventEmailAccess.create({ data: { emailNormalized: email, eventId: innovation.id } });
    const admin = await seedUser({ email: 'admin-scope-bound@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const invited = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, eventSlug: 'tedxucb' });
    expect(invited.status).toBe(200);
    const { token: rawToken } = tokenFromSentLink(mailSend, 'identity-invitation');
    const stored = await prismaTestClient.identityInvitation.findUniqueOrThrow({ where: { tokenHash: hashToken(rawToken) } });
    expect(stored.eventId).toBe(tedx.id);

    await prismaTestClient.eventEmailAccess.update({
      where: { emailNormalized_eventId: { emailNormalized: email, eventId: tedx.id } },
      data: { revokedAt: new Date() },
    });
    const consumed = await request(app.getHttpServer())
      .post('/api/v1/auth/identity-invitations/consume')
      .send({ token: rawToken });
    expect(consumed.status).toBe(403);
    expect(consumed.body.error).toBe('EMAIL_NOT_AUTHORIZED');
    expect((await prismaTestClient.identityInvitation.findUniqueOrThrow({ where: { id: stored.id } })).consumedAt).toBeNull();
  });

  it('impide que un ADMIN sin acceso al evento envie invitaciones de ese evento', async () => {
    const tedx = await prismaTestClient.event.create({
      data: { name: 'TEDxUCB', slug: 'tedxucb', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    const innovation = await prismaTestClient.event.create({
      data: { name: 'Innovation Week', slug: 'innovation-week', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    const admin = await seedUser({ email: 'admin-tedx-only@example.net', roles: ['ADMIN'] });
    await prismaTestClient.eventEmailAccess.update({
      where: { emailNormalized_eventId: { emailNormalized: admin.email, eventId: innovation.id } },
      data: { revokedAt: new Date() },
    });
    await prismaTestClient.eventEmailAccess.create({ data: { emailNormalized: 'invite-target@example.net', eventId: innovation.id } });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'invite-target@example.net', eventSlug: 'innovation-week' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('EVENT_ACCESS_DENIED');
    expect(await prismaTestClient.identityInvitation.count()).toBe(0);
    expect(mailSend).not.toHaveBeenCalled();
    expect(await prismaTestClient.eventEmailAccess.findFirst({
      where: { emailNormalized: admin.email, eventId: tedx.id, revokedAt: null },
    })).toBeTruthy();
  });
  it('la invitación no crea whitelist, no concede sesión y no envía correo a un destino no autorizado', async () => {
    await prismaTestClient.event.create({
      data: { name: 'Innovation Week', slug: 'innovation-week', startsAt: new Date('2027-01-01T12:00:00Z') },
    });
    const admin = await seedUser({ email: 'admin-no-whitelist@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'no-permitido@example.net', eventSlug: 'innovation-week' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('EMAIL_NOT_AUTHORIZED');
    expect(mailSend).not.toHaveBeenCalled();
    expect(await prismaTestClient.identityInvitation.count()).toBe(0);
    expect(await prismaTestClient.eventEmailAccess.count({ where: { emailNormalized: 'no-permitido@example.net' } })).toBe(0);

    const staff = await seedUser({ email: 'staff-no-whitelist@ucb.edu.bo', roles: ['STAFF'] });
    const staffToken = await loginAs(app, staff.email);
    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ email: 'otra-persona@example.net', eventSlug: 'innovation-week' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe('FORBIDDEN');
    expect(mailSend).not.toHaveBeenCalled();
  });

  it('un correo externo requiere Google y nonce válido, envía verificación con hash y consumo único', async () => {
    const email = 'externo@example.net';
    await seedAuthorizedEmail(email);
    const nonce = await googleChallenge(email, 'google-sub-email-proof');
    const before = Date.now();

    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/google/email-verification/request')
      .send({ credential: 'credential-fixture', nonce, eventSlug: 'innovation-week' });

    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe('SENT');
    expect(new Date(requested.body.expiresAt).getTime()).toBeGreaterThanOrEqual(before + THREE_DAYS_MS - 5000);
    const { token: rawToken, payload } = tokenFromSentLink(mailSend, 'identity-email-verification');
    expect(payload.to).toBe(email);
    expect(new URL(payload.url).origin).toBe('http://localhost:5173');
    const proof = await prismaTestClient.externalEmailProof.findUniqueOrThrow({
      where: { subject_email: { subject: 'google-sub-email-proof', email } },
    });
    expect(proof.tokenHash).toBe(hashToken(rawToken));
    expect(proof.tokenHash).not.toBe(rawToken);
    expect(proof.verifiedAt).toBeNull();

    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/auth/google/email-verification/confirm')
      .send({ token: rawToken });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ status: 'VERIFIED' });
    const verified = await prismaTestClient.externalEmailProof.findUniqueOrThrow({ where: { id: proof.id } });
    expect(verified.verifiedAt).toBeTruthy();
    expect(verified.consumedAt).toBeTruthy();

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/google/email-verification/confirm')
      .send({ token: rawToken });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('INVALID_EMAIL_LINK');

    const renewedNonce = await googleChallenge(email, 'google-sub-email-proof');
    const alreadyVerified = await request(app.getHttpServer())
      .post('/api/v1/auth/google/email-verification/request')
      .send({ credential: 'credential-fixture', nonce: renewedNonce, eventSlug: 'innovation-week' });
    expect(alreadyVerified.status).toBe(200);
    expect(alreadyVerified.body).toEqual({ status: 'ALREADY_VERIFIED' });
    expect(mailSend).toHaveBeenCalledTimes(1);
  });

  it('rechaza correo UCB sin Workspace exacto y no crea prueba ni envía correo', async () => {
    const email = 'persona@ucb.edu.bo';
    const nonce = await googleChallenge(email, 'google-sub-ucb');
    googleVerifier.mockImplementation(async () => ({
      getPayload: () => ({ sub: 'google-sub-ucb', email, email_verified: true, nonce, hd: 'xucb.edu.bo' }),
    }));

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/google/email-verification/request')
      .send({ credential: 'credential-fixture', nonce, eventSlug: 'innovation-week' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('WORKSPACE_REQUIRED');
    expect(mailSend).not.toHaveBeenCalled();
    expect(await prismaTestClient.externalEmailProof.count()).toBe(0);
  });

  it('token vencido, revocación de whitelist y replay no validan el enlace', async () => {
    await seedAuthorizedEmail('vencido@example.net');
    const admin = await seedUser({ email: 'admin-expire-id-invite@ucb.edu.bo', roles: ['ADMIN'] });
    const auth = await loginAs(app, admin.email);
    await request(app.getHttpServer()).post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${auth}`).send({ email: 'vencido@example.net', eventSlug: 'innovation-week' });
    const { token: invitationToken } = tokenFromSentLink(mailSend, 'identity-invitation');
    const expiredAt = new Date(Date.now() - THREE_DAYS_MS - 1000);
    await prismaTestClient.identityInvitation.updateMany({
      data: { createdAt: expiredAt, expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app.getHttpServer()).post('/api/v1/auth/identity-invitations/consume').send({ token: invitationToken });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe('INVALID_EMAIL_LINK');

    const email = 'revoked@example.net';
    const event = await prismaTestClient.event.findFirstOrThrow();
    const access = await prismaTestClient.eventEmailAccess.create({ data: { emailNormalized: email, eventId: event.id } });
    const nonce = await googleChallenge(email, 'google-sub-revoked-proof');
    googleVerifier.mockImplementation(async () => ({
      getPayload: () => ({ sub: 'google-sub-revoked-proof', email, email_verified: true, nonce }),
    }));
    const requested = await request(app.getHttpServer()).post('/api/v1/auth/google/email-verification/request')
      .send({ credential: 'credential-fixture', nonce, eventSlug: 'innovation-week' });
    expect(requested.status).toBe(200);
    const { token: proofToken } = tokenFromSentLink(mailSend, 'identity-email-verification');
    await prismaTestClient.eventEmailAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } });
    const revoked = await request(app.getHttpServer()).post('/api/v1/auth/google/email-verification/confirm').send({ token: proofToken });
    expect(revoked.status).toBe(403);
    expect(revoked.body.error).toBe('EMAIL_NOT_AUTHORIZED');
    expect((await prismaTestClient.externalEmailProof.findUniqueOrThrow({ where: { tokenHash: hashToken(proofToken) } })).consumedAt).toBeNull();
  });

  it('si falla el transporte, mantiene la prueba emitida y responde DELIVERY_FAILED sin enviar correo real', async () => {
    const email = 'fallo-mail@example.net';
    await seedAuthorizedEmail(email);
    const nonce = await googleChallenge(email, 'google-sub-mail-fail');
    mailSend.mockRejectedValueOnce(new Error('SMTP local simulado fuera de servicio'));

    const response = await request(app.getHttpServer()).post('/api/v1/auth/google/email-verification/request')
      .send({ credential: 'credential-fixture', nonce, eventSlug: 'innovation-week' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('DELIVERY_FAILED');
    const proof = await prismaTestClient.externalEmailProof.findUniqueOrThrow({
      where: { subject_email: { subject: 'google-sub-mail-fail', email } },
    });
    expect(proof.tokenHash).toBeTruthy();
    expect(proof.verifiedAt).toBeNull();
  });

  it('si falla el transporte de una invitación, conserva permiso y token para reintento manual', async () => {
    const email = 'fallo-invitacion@example.net';
    await seedAuthorizedEmail(email, 'innovation-week');
    const admin = await seedUser({ email: 'admin-invitation-mail-fail@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    mailSend.mockRejectedValueOnce(new Error('SMTP local simulado fuera de servicio'));

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, eventSlug: 'innovation-week' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('DELIVERY_FAILED');
    expect(await prismaTestClient.eventEmailAccess.count({ where: { emailNormalized: email, revokedAt: null } })).toBe(1);
    expect(await prismaTestClient.identityInvitation.count({ where: { email } })).toBe(1);
  });
});
