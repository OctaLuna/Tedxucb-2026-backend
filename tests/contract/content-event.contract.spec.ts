import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedEvent } from '../support/seed-content';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

describe('Evento y cuenta regresiva (contrato, RF-201 RF-204 RF-205 RF-218 RF-220)', () => {
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

  describe('GET /api/v1/public/event', () => {
    it('devuelve el evento publicado con serverTime y eventStatus UPCOMING, sin caché', async () => {
      await seedEvent({ status: 'PUBLISHED', startsAt: new Date(Date.now() + 60 * 60 * 1000) });

      const first = await request(app.getHttpServer()).get('/api/v1/public/event');

      expect(first.status).toBe(200);
      expect(first.headers['cache-control']).toBe('no-store');
      expect(first.body).toMatchObject({
        event: { name: 'TEDxUCB de prueba' },
        eventStatus: 'UPCOMING',
      });
      expect(typeof first.body.serverTime).toBe('string');

      const second = await request(app.getHttpServer()).get('/api/v1/public/event');
      expect(new Date(second.body.serverTime).getTime()).toBeGreaterThan(
        new Date(first.body.serverTime).getTime(),
      );
    });

    it('devuelve eventStatus FINISHED, nunca negativo, cuando startsAt ya pasó', async () => {
      await seedEvent({ status: 'PUBLISHED', startsAt: new Date(Date.now() - 60 * 60 * 1000) });

      const response = await request(app.getHttpServer()).get('/api/v1/public/event');

      expect(response.status).toBe(200);
      expect(response.body.eventStatus).toBe('FINISHED');
    });

    it('rechaza con 404 EVENT_NOT_CONFIGURED sin ningún evento publicado', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/public/event');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('EVENT_NOT_CONFIGURED');
    });

    it('rechaza con 429 TOO_MANY_REQUESTS al superar el límite de frecuencia', async () => {
      await seedEvent();

      for (let i = 0; i < 60; i += 1) {
        const response = await request(app.getHttpServer()).get('/api/v1/public/event');
        expect(response.status).toBe(200);
      }

      const limited = await request(app.getHttpServer()).get('/api/v1/public/event');
      expect(limited.status).toBe(429);
      expect(limited.body.error).toBe('TOO_MANY_REQUESTS');
    }, 20000);
  });

  describe('GET/PATCH /api/v1/events (admin)', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/events');
      expect(response.status).toBe(401);
    });

    it('un STAFF no puede listar ni editar eventos', async () => {
      const staff = await seedUser({ email: 'staff-events@ucb.edu.bo', roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('ADMIN lista los eventos incluyendo los DRAFT', async () => {
      const admin = await seedUser({ email: 'admin-events@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedEvent({ status: 'DRAFT', name: 'Borrador' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.some((e: { status: string }) => e.status === 'DRAFT')).toBe(true);
    });

    it('ADMIN obtiene el detalle por id; 404 NOT_FOUND con id inexistente', async () => {
      const admin = await seedUser({ email: 'admin-events2@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const event = await seedEvent();

      const found = await request(app.getHttpServer())
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(found.status).toBe(200);

      const missing = await request(app.getHttpServer())
        .get(`/api/v1/events/${NONEXISTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe('NOT_FOUND');
    });

    it('ADMIN reprograma el evento vía PATCH', async () => {
      const admin = await seedUser({ email: 'admin-events3@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const event = await seedEvent();
      const newStartsAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ venue: 'Auditorio UCB', tagline: 'Sostenibilidad', startsAt: newStartsAt });

      expect(response.status).toBe(200);
      expect(response.body.venue).toBe('Auditorio UCB');
      expect(response.body.tagline).toBe('Sostenibilidad');
      expect(new Date(response.body.startsAt).toISOString()).toBe(newStartsAt);
    });

    it('rechaza con 409 ANOTHER_EVENT_ALREADY_PUBLISHED publicar un segundo evento', async () => {
      const admin = await seedUser({ email: 'admin-events4@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedEvent({ status: 'PUBLISHED' });
      const draft = await prismaTestClient.event.create({
        data: { name: 'Segundo evento', startsAt: new Date(Date.now() + 1000), status: 'DRAFT' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/events/${draft.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('ANOTHER_EVENT_ALREADY_PUBLISHED');
    });
  });

  describe('POST /api/v1/events/:id/image (admin)', () => {
    it('acepta una imagen PNG real, devuelve imageUrl y registra audit_log', async () => {
      const admin = await seedUser({ email: 'admin-events5@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const event = await seedEvent();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/image`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', MINIMAL_VALID_PNG, 'evento.png');

      expect(response.status).toBe(200);
      expect(response.body.imageUrl).toMatch(/^\/uploads\/events\/[\w-]+\.png$/);

      const updated = await prismaTestClient.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(updated.imageUrl).toBe(response.body.imageUrl);

      const auditRow = await prismaTestClient.auditLog.findFirst({
        where: { action: 'EVENT_IMAGE_UPDATED', entityId: event.id },
      });
      expect(auditRow).not.toBeNull();
    });

    it('rechaza con 422 INVALID_IMAGE un archivo que no es una imagen real', async () => {
      const admin = await seedUser({ email: 'admin-events6@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const event = await seedEvent();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/image`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('esto no es una imagen'), 'evento.png');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('INVALID_IMAGE');
    });

    it('rechaza con 413 FILE_TOO_LARGE un archivo que excede el tamaño máximo', async () => {
      const admin = await seedUser({ email: 'admin-events7@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const event = await seedEvent();
      const oversized = Buffer.alloc(6 * 1024 * 1024, 0);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/events/${event.id}/image`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', oversized, 'grande.png');

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
    });
  });
});
