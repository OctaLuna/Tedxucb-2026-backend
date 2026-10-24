import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { clearMailpit, waitForMailpitMessage } from '../support/mailpit-client';
import { seedUser } from '../support/seed-user';
import { seedTestEvent, grantEventAccess } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

describe('Entrega SMTP de invitación de identidad (integración, Mailpit real)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASSWORD = '';
    process.env.MAIL_FROM = 'UCB Identity Test <identity-test@localhost>';
    process.env.PUBLIC_FRONTEND_URL_TEDX = 'http://localhost:3000';
    process.env.PUBLIC_FRONTEND_URL_INNOVATION_WEEK = 'http://localhost:5173';
    delete process.env.QSTASH_TOKEN;
    delete process.env.PUBLIC_URL;
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
    await clearMailpit();
    await seedTestEvent('tedxucb');
    await seedTestEvent('innovation-week');
  });

  it('envía por SMTP local al correo autorizado y usa el origen del evento', async () => {
    const admin = await seedUser({ email: 'admin-mailpit@ucb.edu.bo', roles: ['ADMIN'] });
    const recipient = 'invitado-mailpit@example.net';
    await grantEventAccess(recipient, 'innovation-week');
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/identity-invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: recipient, eventSlug: 'innovation-week' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SENT');
    const message = await waitForMailpitMessage((mail) => mail.To.some((to) => to.Address === recipient));
    expect(message.Subject).toBe('Invitación a los eventos UCB');
    expect(message.Snippet).toContain('localhost:5173/#invitation=');
    expect(await prismaTestClient.eventEmailAccess.count({ where: { emailNormalized: recipient, revokedAt: null } })).toBe(1);
    expect(await prismaTestClient.identityInvitation.count({ where: { email: recipient } })).toBe(1);
  });
});
