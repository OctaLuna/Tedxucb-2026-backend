import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { completeSpeakerFields } from '../support/seed-speakers';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Historia 3 completa: fichas de speaker (T072)', () => {
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

  it('vacío -> crear incompleto -> publicar rechazado -> completar -> publicar -> aparece -> despublicar -> desaparece sin borrarse', async () => {
    const admin = await seedUser({ email: 'admin-lifecycle@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const empty = await request(app.getHttpServer()).get('/api/v1/public/speakers');
    expect(empty.body).toEqual([]);

    const created = await request(app.getHttpServer())
      .post('/api/v1/speakers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Speaker de prueba' });
    expect(created.status).toBe(201);
    const speakerId = created.body.id;

    const rejectedPublish = await request(app.getHttpServer())
      .patch(`/api/v1/speakers/${speakerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PUBLISHED' });
    expect(rejectedPublish.status).toBe(422);

    // Texto (incl. photoAltText) por PATCH; la foto en sí solo por subida de
    // archivo -- completeSpeakerFields().photoUrl no aplica acá, se descarta
    // por whitelist (UpdateSpeakerDto no acepta photoUrl, ver speakers.module).
    const { photoUrl: _photoUrl, ...textFields } = completeSpeakerFields();
    const complete = await request(app.getHttpServer())
      .patch(`/api/v1/speakers/${speakerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(textFields);
    expect(complete.status).toBe(200);

    const photo = await request(app.getHttpServer())
      .post(`/api/v1/speakers/${speakerId}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', MINIMAL_VALID_PNG, 'speaker.png');
    expect(photo.status).toBe(200);

    const published = await request(app.getHttpServer())
      .patch(`/api/v1/speakers/${speakerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PUBLISHED' });
    expect(published.status).toBe(200);

    const appearsPublic = await request(app.getHttpServer()).get('/api/v1/public/speakers');
    expect(appearsPublic.body.map((s: { id: string }) => s.id)).toContain(speakerId);

    const unpublished = await request(app.getHttpServer())
      .patch(`/api/v1/speakers/${speakerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DRAFT' });
    expect(unpublished.status).toBe(200);

    const disappearsPublic = await request(app.getHttpServer()).get('/api/v1/public/speakers');
    expect(disappearsPublic.body.map((s: { id: string }) => s.id)).not.toContain(speakerId);

    const stillExists = await prismaTestClient.speaker.findUnique({ where: { id: speakerId } });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe('DRAFT');
  });
});
