import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedEvent } from '../support/seed-content';
import { completeSpeakerFields, seedSpeaker } from '../support/seed-speakers';
import { prismaTestClient } from '../support/prisma-test-client';
import { seedUser } from '../support/seed-user';

async function login(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('programa público y administración event-scoped', () => {
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

  it('publica y lee elementos por evento sin mezclar TEDx e Innovation Week', async () => {
    const tedx = await seedEvent();
    const innovation = await seedEvent({
      slug: 'innovation-week',
      name: 'Semana de la Facultad',
      status: 'PUBLISHED',
    });
    const admin = await seedUser({ email: 'program-admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const payload = (title: string) => ({
      title,
      type: 'TALK',
      startsAt: '2026-11-02T09:00:00-04:00',
      endsAt: '2026-11-02T09:20:00-04:00',
      status: 'PUBLISHED',
    });

    const tedxItem = await request(app.getHttpServer())
      .post('/api/v1/event-program?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`)
      .send(payload('TEDx charla'));
    const innovationItem = await request(app.getHttpServer())
      .post('/api/v1/event-program?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${token}`)
      .send(payload('Innovation taller'));

    expect(tedxItem.status).toBe(201);
    expect(innovationItem.status).toBe(201);

    const tedxList = await request(app.getHttpServer()).get('/api/v1/public/program?eventSlug=tedxucb');
    const innovationList = await request(app.getHttpServer()).get('/api/v1/public/program?eventSlug=innovation-week');
    expect(tedxList.body.data.map((item: { title: string }) => item.title)).toEqual(['TEDx charla']);
    expect(innovationList.body.data.map((item: { title: string }) => item.title)).toEqual(['Innovation taller']);
    expect(tedxItem.body.eventId).toBe(tedx.id);
    expect(innovationItem.body.eventId).toBe(innovation.id);
  });

  it('no permite asociar un speaker de otro evento al programa', async () => {
    await seedEvent();
    await seedEvent({ slug: 'innovation-week', name: 'Semana de la Facultad', status: 'PUBLISHED' });
    const speaker = await seedSpeaker({ eventSlug: 'innovation-week' });
    const admin = await seedUser({ email: 'program-cross-event@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/event-program?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'No debe vincularse',
        type: 'TALK',
        speakerId: speaker.id,
        startsAt: '2026-11-02T09:00:00-04:00',
        endsAt: '2026-11-02T09:20:00-04:00',
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INVALID_SPEAKER');
  });

  it('no permite publicar el programa con un speaker en borrador ni un rango de horas invertido', async () => {
    await seedEvent();
    const speaker = await seedSpeaker({ eventSlug: 'tedxucb' });
    const admin = await seedUser({ email: 'program-draft-speaker@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const base = {
      title: 'Charla sin speaker publicado',
      type: 'TALK',
      speakerId: speaker.id,
      startsAt: '2026-11-02T09:00:00-04:00',
      endsAt: '2026-11-02T09:20:00-04:00',
    };

    const unpublishedSpeaker = await request(app.getHttpServer())
      .post('/api/v1/event-program')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, status: 'PUBLISHED' });
    const invalidRange = await request(app.getHttpServer())
      .post('/api/v1/event-program')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, speakerId: undefined, startsAt: base.endsAt, endsAt: base.startsAt });

    expect(unpublishedSpeaker.status).toBe(422);
    expect(unpublishedSpeaker.body.error).toBe('SPEAKER_NOT_PUBLISHED');
    expect(invalidRange.status).toBe(422);
    expect(invalidRange.body.error).toBe('INVALID_TIME_RANGE');
  });

  it('omite datos del speaker cuando una charla publicada queda ligada a un speaker despublicado', async () => {
    await seedEvent();
    const speaker = await seedSpeaker({ status: 'PUBLISHED', ...completeSpeakerFields() });
    const admin = await seedUser({ email: 'program-unpublish-speaker@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const created = await request(app.getHttpServer())
      .post('/api/v1/event-program')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Charla del speaker',
        type: 'TALK',
        speakerId: speaker.id,
        startsAt: '2026-11-02T09:00:00-04:00',
        endsAt: '2026-11-02T09:20:00-04:00',
        status: 'PUBLISHED',
      });
    expect(created.status).toBe(201);

    await prismaTestClient.speaker.update({ where: { id: speaker.id }, data: { status: 'DRAFT' } });
    const publicList = await request(app.getHttpServer()).get('/api/v1/public/program?eventSlug=tedxucb');

    expect(publicList.status).toBe(200);
    expect(publicList.body.data[0].speaker).toBeNull();
  });

  it('solo ADMIN administra y los borradores no son visibles públicamente', async () => {
    await seedEvent();
    const admin = await seedUser({ email: 'program-admin-draft@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const draft = await request(app.getHttpServer())
      .post('/api/v1/event-program')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Borrador', type: 'TALK', startsAt: '2026-11-02T09:00:00Z', endsAt: '2026-11-02T09:20:00Z' });
    const publicList = await request(app.getHttpServer()).get('/api/v1/public/program?eventSlug=tedxucb');
    const participant = await seedUser({ email: 'program-participant@ucb.edu.bo' });
    const participantToken = await login(app, participant.email);
    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/event-program')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ title: 'No', type: 'TALK', startsAt: '2026-11-02T09:00:00Z', endsAt: '2026-11-02T09:20:00Z' });

    expect(draft.status).toBe(201);
    expect(publicList.body.data).toEqual([]);
    expect(forbidden.status).toBe(403);
  });
});
