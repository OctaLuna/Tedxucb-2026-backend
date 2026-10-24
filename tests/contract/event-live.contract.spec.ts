import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedEvent } from '../support/seed-content';
import { seedUser } from '../support/seed-user';

async function login(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('En Vivo editorial event-scoped', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); await closeRedisTestClient(); await closeTestDb(); });
  beforeEach(async () => { await cleanAllTables(); await cleanRateLimits(); });

  it('administra settings por evento y publica actividades sin revelar respuestas', async () => {
    const event = await seedEvent();
    await seedEvent({ slug: 'innovation-week', name: 'Semana de la Facultad', status: 'PUBLISHED' });
    const admin = await seedUser({ email: 'live-admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const created = await request(app.getHttpServer()).post('/api/v1/event-live/activities?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'En Vivo TEDx', description: 'Conversacion en directo',
        startsAt: '2026-11-12T09:00:00-04:00', endsAt: '2026-11-12T10:00:00-04:00',
        activationMode: 'active', status: 'PUBLISHED',
        configuration: { enabled: true, questions: [{
          prompt: '¿Qué impulsa una idea?', options: ['Curiosidad', 'Miedo'], correctOptionIndex: 0, timeLimitSeconds: 30, points: 100,
        }] },
        media: [{ name: 'Presentación', kind: 'resource', url: 'https://example.org/tedx.pdf' }],
      });
    expect(created.status).toBe(201);
    expect(created.body.eventId).toBe(event.id);
    expect(created.body.questions[0].correctOptionId).toBeDefined();

    const enabled = await request(app.getHttpServer()).put('/api/v1/event-live?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({ enabled: true, manualActivityId: created.body.id });
    const publicResponse = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=tedxucb');
    const otherEvent = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=innovation-week');

    expect(enabled.status).toBe(200);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.enabled).toBe(true);
    expect(publicResponse.body.featuredActivity.id).toBe(created.body.id);
    expect(publicResponse.body.featuredActivity.questions[0]).not.toHaveProperty('correctOptionId');
    expect(publicResponse.body.activities).toHaveLength(1);
    expect(otherEvent.body.activities).toEqual([]);
    expect(otherEvent.body.enabled).toBe(true);
  });

  it('rechaza una actividad o override que use IDs de otro evento', async () => {
    await seedEvent();
    await seedEvent({ slug: 'innovation-week', name: 'Semana de la Facultad', status: 'PUBLISHED' });
    const admin = await seedUser({ email: 'live-cross-event@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const activity = await request(app.getHttpServer()).post('/api/v1/event-live/activities?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'Taller Innovation', startsAt: '2026-11-12T09:00:00-04:00', endsAt: '2026-11-12T10:00:00-04:00', status: 'PUBLISHED',
      });
    const foreignProgram = await request(app.getHttpServer()).post('/api/v1/event-program?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'Programa Innovation', type: 'TALK', startsAt: '2026-11-12T09:00:00-04:00', endsAt: '2026-11-12T10:00:00-04:00', status: 'PUBLISHED',
      });
    const crossLink = await request(app.getHttpServer()).post('/api/v1/event-live/activities?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'Referencia cruzada', agendaSlotId: foreignProgram.body.id,
        startsAt: '2026-11-12T09:00:00-04:00', endsAt: '2026-11-12T10:00:00-04:00',
      });
    const crossOverride = await request(app.getHttpServer()).put('/api/v1/event-live?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({ enabled: true, manualActivityId: activity.body.id });

    expect(crossLink.status).toBe(422);
    expect(crossOverride.status).toBe(422);
  });

  it('valida ranges, opciones correctas y URLs HTTPS', async () => {
    await seedEvent();
    const admin = await seedUser({ email: 'live-validation@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const invalid = await request(app.getHttpServer()).post('/api/v1/event-live/activities')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'Config inválida', startsAt: '2026-11-12T10:00:00Z', endsAt: '2026-11-12T09:00:00Z',
        configuration: { enabled: true, questions: [{
          prompt: 'Pregunta', options: ['Una', 'Dos'], correctOptionIndex: 7, timeLimitSeconds: 30, points: 10,
        }] },
        media: [{ name: 'Archivo', kind: 'video', url: 'http://inseguro.example/video.mp4' }],
      });
    expect(invalid.status).toBe(400);
  });

  it('solo permite escribir a ADMIN con acceso al evento', async () => {
    await seedEvent();
    const participant = await seedUser({ email: 'live-participant@ucb.edu.bo' });
    const token = await login(app, participant.email);
    const response = await request(app.getHttpServer()).post('/api/v1/event-live/activities')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'No autorizado', startsAt: '2026-11-12T09:00:00Z', endsAt: '2026-11-12T10:00:00Z',
      });
    expect(response.status).toBe(403);
  });

  it('aplica el override, permite pausar el endpoint y cancela sin borrar el historial', async () => {
    const event = await seedEvent();
    const admin = await seedUser({ email: 'live-override@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    const created = await request(app.getHttpServer()).post('/api/v1/event-live/activities?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({ title: 'En Vivo programado', startsAt, endsAt, status: 'PUBLISHED' });
    expect(created.status).toBe(201);

    const settings = await request(app.getHttpServer()).put('/api/v1/event-live?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({ manualActivityId: created.body.id });
    const selected = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=tedxucb');
    expect(settings.status).toBe(200);
    expect(selected.body.featuredActivity.id).toBe(created.body.id);

    const paused = await request(app.getHttpServer()).put('/api/v1/event-live?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({ enabled: false });
    const unavailable = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=tedxucb');
    expect(paused.status).toBe(200);
    expect(unavailable.body.enabled).toBe(false);
    expect(unavailable.body.featuredActivity).toBeNull();

    const cancelled = await request(app.getHttpServer()).delete(`/api/v1/event-live/activities/${created.body.id}?eventSlug=tedxucb`)
      .set('Authorization', `Bearer ${token}`);
    const adminSnapshot = await request(app.getHttpServer()).get('/api/v1/event-live?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(adminSnapshot.body.activities).toHaveLength(1);
    expect(adminSnapshot.body.manualActivityId).toBeNull();
    expect(adminSnapshot.body.eventId).toBe(event.id);
  });

  it('trata el límite de inicio incluido y fin excluido del horario', async () => {
    await seedEvent();
    const admin = await seedUser({ email: 'live-schedule@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await login(app, admin.email);
    const now = Date.now();
    const created = await request(app.getHttpServer()).post('/api/v1/event-live/activities?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).send({
        title: 'Horario de frontera', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 60_000).toISOString(), status: 'PUBLISHED',
      });
    expect(created.status).toBe(201);
    const current = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=tedxucb');
    expect(current.body.featuredActivity.id).toBe(created.body.id);

    await request(app.getHttpServer()).patch(`/api/v1/event-live/activities/${created.body.id}?eventSlug=tedxucb`)
      .set('Authorization', `Bearer ${token}`).send({ startsAt: new Date(now - 120_000).toISOString(), endsAt: new Date(now - 1000).toISOString() });
    const finished = await request(app.getHttpServer()).get('/api/v1/public/live?eventSlug=tedxucb');
    expect(finished.body.featuredActivity).toBeNull();
  });
});
