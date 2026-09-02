import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedSpeaker, completeSpeakerFields } from '../support/seed-speakers';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

describe('Speakers (contrato, RF-206 a RF-209, RF-217)', () => {
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

  describe('GET /api/v1/public/speakers', () => {
    it('devuelve lista vacía sin error cuando no hay ninguno publicado', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/public/speakers');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('excluye estrictamente los DRAFT y ordena por displayOrder', async () => {
      await seedSpeaker({ fullName: 'No publicado', status: 'DRAFT' });
      const second = await seedSpeaker({
        fullName: 'Segundo',
        status: 'PUBLISHED',
        displayOrder: 1,
        ...completeSpeakerFields(),
      });
      const first = await seedSpeaker({
        fullName: 'Primero',
        status: 'PUBLISHED',
        displayOrder: 0,
        ...completeSpeakerFields(),
      });

      const response = await request(app.getHttpServer()).get('/api/v1/public/speakers');
      expect(response.status).toBe(200);
      expect(response.body.map((s: { id: string }) => s.id)).toEqual([first.id, second.id]);
    });

    it('rechaza con 429 TOO_MANY_REQUESTS al superar el límite de frecuencia', async () => {
      for (let i = 0; i < 60; i += 1) {
        const response = await request(app.getHttpServer()).get('/api/v1/public/speakers');
        expect(response.status).toBe(200);
      }
      const limited = await request(app.getHttpServer()).get('/api/v1/public/speakers');
      expect(limited.status).toBe(429);
      expect(limited.body.error).toBe('TOO_MANY_REQUESTS');
    }, 20000);
  });

  describe('CRUD admin de /api/v1/speakers', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/speakers');
      expect(response.status).toBe(401);
    });

    it('un STAFF no puede administrar speakers', async () => {
      const staff = await seedUser({ email: 'staff-speakers@ucb.edu.bo', roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const response = await request(app.getHttpServer())
        .get('/api/v1/speakers')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('ADMIN crea un speaker en DRAFT ignorando cualquier status enviado', async () => {
      const admin = await seedUser({ email: 'admin-speakers@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/speakers')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Nuevo Speaker', status: 'PUBLISHED' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('DRAFT');
    });

    it('rechaza con 400 VALIDATION_ERROR sin fullName', async () => {
      const admin = await seedUser({ email: 'admin-speakers2@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/speakers')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('ADMIN lista (paginado) y obtiene el detalle; 404 con id inexistente', async () => {
      const admin = await seedUser({ email: 'admin-speakers3@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker();

      const list = await request(app.getHttpServer())
        .get('/api/v1/speakers')
        .set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(1);

      const found = await request(app.getHttpServer())
        .get(`/api/v1/speakers/${speaker.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(found.status).toBe(200);

      const missing = await request(app.getHttpServer())
        .get(`/api/v1/speakers/${NONEXISTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe('NOT_FOUND');
    });

    it('PATCH publica un speaker completo y reaparece en /public/speakers', async () => {
      const admin = await seedUser({ email: 'admin-speakers4@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker(completeSpeakerFields());

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/speakers/${speaker.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });
      expect(patch.status).toBe(200);

      const publicList = await request(app.getHttpServer()).get('/api/v1/public/speakers');
      expect(publicList.body.map((s: { id: string }) => s.id)).toContain(speaker.id);
    });

    it('rechaza con 422 INCOMPLETE_SPEAKER publicar uno incompleto, con details.missingFields', async () => {
      const admin = await seedUser({ email: 'admin-speakers5@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker({ headline: 'Solo tiene esto' });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/speakers/${speaker.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PUBLISHED' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('INCOMPLETE_SPEAKER');
      expect(response.body.details.missingFields).toEqual(
        expect.arrayContaining(['bio', 'talkTitle', 'photoUrl', 'photoAltText']),
      );
      expect(response.body.details.missingFields).not.toContain('headline');
    });
  });

  describe('POST /api/v1/speakers/:id/photo', () => {
    it('acepta una imagen PNG real, devuelve photoUrl y registra audit_log', async () => {
      const admin = await seedUser({ email: 'admin-speakers6@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/speakers/${speaker.id}/photo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', MINIMAL_VALID_PNG, 'speaker.png');

      expect(response.status).toBe(200);
      expect(response.body.photoUrl).toMatch(/^\/uploads\/speakers\/[\w-]+\.png$/);

      const updated = await prismaTestClient.speaker.findUniqueOrThrow({ where: { id: speaker.id } });
      expect(updated.photoUrl).toBe(response.body.photoUrl);

      const auditRow = await prismaTestClient.auditLog.findFirst({
        where: { action: 'SPEAKER_PHOTO_UPDATED', entityId: speaker.id },
      });
      expect(auditRow).not.toBeNull();
    });

    it('rechaza con 422 INVALID_IMAGE un archivo que no es una imagen real', async () => {
      const admin = await seedUser({ email: 'admin-speakers7@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/speakers/${speaker.id}/photo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('esto no es una imagen'), 'speaker.png');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('INVALID_IMAGE');
    });

    it('rechaza con 413 FILE_TOO_LARGE un archivo que excede el tamaño máximo', async () => {
      const admin = await seedUser({ email: 'admin-speakers8@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await seedSpeaker();
      const oversized = Buffer.alloc(6 * 1024 * 1024, 0);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/speakers/${speaker.id}/photo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', oversized, 'grande.png');

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
    });
  });

  describe('POST /api/v1/speakers/reorder', () => {
    it('reescribe displayOrder y se refleja en /public/speakers', async () => {
      const admin = await seedUser({ email: 'admin-speakers9@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const a = await seedSpeaker({ fullName: 'A', status: 'PUBLISHED', displayOrder: 0, ...completeSpeakerFields() });
      const b = await seedSpeaker({ fullName: 'B', status: 'PUBLISHED', displayOrder: 1, ...completeSpeakerFields() });

      const response = await request(app.getHttpServer())
        .post('/api/v1/speakers/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [b.id, a.id] });

      expect(response.status).toBe(200);

      const publicList = await request(app.getHttpServer()).get('/api/v1/public/speakers');
      expect(publicList.body.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
    });

    it('rechaza con 400 VALIDATION_ERROR una lista con un id ajeno', async () => {
      const admin = await seedUser({ email: 'admin-speakers10@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const a = await seedSpeaker();

      const response = await request(app.getHttpServer())
        .post('/api/v1/speakers/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [a.id, NONEXISTENT_ID] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('rechaza con 400 VALIDATION_ERROR una lista incompleta', async () => {
      const admin = await seedUser({ email: 'admin-speakers11@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedSpeaker({ fullName: 'A' });
      const b = await seedSpeaker({ fullName: 'B' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/speakers/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [b.id] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });
});
