import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedStudent } from '../support/seed-catalog';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('POST /api/v1/me/avatar (contrato)', () => {
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

  it('acepta una imagen PNG real y devuelve avatarUrl sin prefijo /api/v1', async () => {
    const { user } = await seedStudent({ email: 'avatar@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', MINIMAL_VALID_PNG, 'avatar.png');

    expect(response.status).toBe(200);
    expect(response.body.avatarUrl).toMatch(/^\/uploads\/avatars\/[\w-]+\.png$/);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.avatarUrl).toBe(response.body.avatarUrl);
  });

  it('rechaza con 422 INVALID_IMAGE un archivo que no es una imagen real, disfrazado con extensión .png', async () => {
    const { user } = await seedStudent({ email: 'avatar2@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('esto no es una imagen, es texto plano'), 'avatar.png');

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_IMAGE');
  });

  it('un archivo inválido NO altera el avatar existente', async () => {
    const { user } = await seedStudent({ email: 'avatar3@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const valid = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', MINIMAL_VALID_PNG, 'avatar.png');
    const originalUrl = valid.body.avatarUrl as string;

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('no es imagen'), 'malicioso.png');
    expect(invalid.status).toBe(422);

    const profile = await prismaTestClient.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.avatarUrl).toBe(originalUrl);
  });

  it('rechaza con 413 FILE_TOO_LARGE un archivo que excede el tamaño máximo', async () => {
    const { user } = await seedStudent({ email: 'avatar4@ucb.edu.bo' });
    const token = await loginAs(app, user.email);
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0); // 6 MB > límite de 5 MB

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, 'grande.png');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('FILE_TOO_LARGE');
  });

  it('rechaza sin ningún archivo adjunto', async () => {
    const { user } = await seedStudent({ email: 'avatar5@ucb.edu.bo' });
    const token = await loginAs(app, user.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_IMAGE');
  });
});
