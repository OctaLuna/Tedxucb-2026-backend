import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { grantEventAccess, seedTestEvent } from '../support/seed-events';
import { TokenPairService } from '../../src/modules/auth/token-pair.service';

const PASSWORD = 'unaClaveSegura9';

async function loginAs(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });

  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

describe('PATCH /api/v1/me/nickname (contrato RF-509/510)', () => {
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

  it('allows account inspection and nickname completion but blocks normal routes beforehand', async () => {
    await seedTestEvent('tedxucb');
    const user = await seedUser({ email: 'onboarding-required@ucb.edu.bo', nickname: null, roles: ['ALUMNO'] });
    await grantEventAccess(user.email, 'tedxucb');
    const token = await loginAs(app, user.email);

    const me = await request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    const events = await request(app.getHttpServer()).get('/api/v1/me/events').set('Authorization', `Bearer ${token}`);
    const blocked = await request(app.getHttpServer()).get('/api/v1/activities?eventSlug=tedxucb').set('Authorization', `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.nickname).toBeNull();
    expect(events.status).toBe(200);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('NICKNAME_REQUIRED');

    const completed = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'Onboard42' });
    expect(completed.status).toBe(200);

    const allowed = await request(app.getHttpServer()).get('/api/v1/activities?eventSlug=tedxucb').set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);
  });

  it('acepta un apodo de tres caracteres con letras y números Unicode', async () => {
    const user = await seedUser({ email: 'nickname-valid@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'A7中' });

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe('A7中');
  });

  it('normaliza el apodo con NFKC antes de guardarlo y responderlo', async () => {
    const user = await seedUser({ email: 'nickname-nfkc@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'Ｌｕｎａ７' });

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe('Luna7');
  });

  it('acepta un apodo de 24 caracteres normalizados', async () => {
    const user = await seedUser({ email: 'nickname-max-valid@ucb.edu.bo' });
    const token = await loginAs(app, user.email);
    const nickname = 'A'.repeat(24);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname });

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe(nickname);
  });

  it.each(['Ab', 'A-b', 'A b', 'A_b', 'A.1', 'A\n1'])('rechaza el apodo inválido %j', async (nickname) => {
    const user = await seedUser({ email: 'nickname-invalid@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_NICKNAME');
  });

  it('rechaza un apodo de 25 caracteres normalizados', async () => {
    const user = await seedUser({ email: 'nickname-max-invalid@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'A'.repeat(25) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_NICKNAME');
  });

  it('requiere autenticación para cambiar el apodo', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .send({ nickname: 'Luna27' });

    expect(response.status).toBe(401);
  });

  it('rechaza cambiar el apodo con un token previo de una cuenta deshabilitada', async () => {
    const user = await seedUser({ email: 'nickname-disabled@ucb.edu.bo' });
    const tokenPair = app.get(TokenPairService);
    const { accessToken } = await tokenPair.issue({
      id: user.id,
      status: user.status,
      roles: user.roles.map(({ role }) => role),
    });
    await prismaTestClient.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });

    const response = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nickname: 'Luna27' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('trata como duplicados globales los apodos que solo difieren en mayúsculas', async () => {
    const firstUser = await seedUser({ email: 'nickname-first@ucb.edu.bo' });
    const secondUser = await seedUser({ email: 'nickname-second@ucb.edu.bo' });
    const firstToken = await loginAs(app, firstUser.email);
    const secondToken = await loginAs(app, secondUser.email);

    const firstResponse = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ nickname: 'Luna27' });
    expect(firstResponse.status).toBe(200);

    const secondResponse = await request(app.getHttpServer())
      .patch('/api/v1/me/nickname')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ nickname: 'lUnA27' });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error).toBe('NICKNAME_TAKEN');
  });

  it('resuelve una carrera por el mismo apodo con exactamente un éxito', async () => {
    const firstUser = await seedUser({ email: 'nickname-race-a@ucb.edu.bo' });
    const secondUser = await seedUser({ email: 'nickname-race-b@ucb.edu.bo' });
    const firstToken = await loginAs(app, firstUser.email);
    const secondToken = await loginAs(app, secondUser.email);

    const results = await Promise.all([
      request(app.getHttpServer())
        .patch('/api/v1/me/nickname')
        .set('Authorization', `Bearer ${firstToken}`)
        .send({ nickname: 'Race42' }),
      request(app.getHttpServer())
        .patch('/api/v1/me/nickname')
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ nickname: 'rACE42' }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body.error).toBe('NICKNAME_TAKEN');
  });
});
