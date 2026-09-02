import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedApplication } from '../support/seed-speakers';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

function validApplicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Postulante de Prueba',
    email: 'postulante@ejemplo.com',
    affiliation: 'Empresa X',
    expertiseArea: 'Sostenibilidad',
    ideaTitle: 'Título de la idea',
    ideaSummary: 'Resumen de la idea con evidencia.',
    evidenceBasis: 'Base de evidencia.',
    applicability: 'Aplicabilidad real.',
    ...overrides,
  };
}

describe('Postulaciones de speaker (contrato, RF-210 a RF-215)', () => {
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

  describe('POST /api/v1/public/applications', () => {
    it('ciclo feliz: 201 con fila persistida', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/public/applications')
        .send(validApplicationPayload());

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PENDING');

      const row = await prismaTestClient.speakerApplication.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(row.email).toBe('postulante@ejemplo.com');
    });

    it('rechaza con 400 VALIDATION_ERROR un campo faltante', async () => {
      const { fullName, ...incomplete } = validApplicationPayload();
      const response = await request(app.getHttpServer()).post('/api/v1/public/applications').send(incomplete);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('señuelo: 201 idéntico pero cero filas persistidas', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/public/applications')
        .send(validApplicationPayload({ website: 'http://bot.example.com' }));

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PENDING');

      const count = await prismaTestClient.speakerApplication.count();
      expect(count).toBe(0);
    });

    it('rechaza con 429 TOO_MANY_REQUESTS al superar el límite de frecuencia', async () => {
      for (let i = 0; i < 5; i += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/public/applications')
          .send(validApplicationPayload({ email: `postulante${i}@ejemplo.com` }));
        expect(response.status).toBe(201);
      }
      const limited = await request(app.getHttpServer())
        .post('/api/v1/public/applications')
        .send(validApplicationPayload({ email: 'postulante-extra@ejemplo.com' }));
      expect(limited.status).toBe(429);
      expect(limited.body.error).toBe('TOO_MANY_REQUESTS');
    }, 20000);
  });

  describe('GET /api/v1/applications (admin)', () => {
    it('rechaza sin autenticar con 401; un STAFF no puede acceder', async () => {
      const unauth = await request(app.getHttpServer()).get('/api/v1/applications');
      expect(unauth.status).toBe(401);

      const staff = await seedUser({ email: 'staff-apps@ucb.edu.bo', roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const forbidden = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`);
      expect(forbidden.status).toBe(403);
    });

    it('muestra meta.total = 0 sin postulaciones', async () => {
      const admin = await seedUser({ email: 'admin-apps@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(0);
    });

    it('calcula submissionsFromSameEmail agrupando sin distinguir mayúsculas', async () => {
      const admin = await seedUser({ email: 'admin-apps2@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedApplication({ email: 'duplicado@ejemplo.com' });
      await seedApplication({ email: 'Duplicado@Ejemplo.com' });
      await seedApplication({ email: 'unico@ejemplo.com' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(3);
      const byEmail = (email: string) =>
        response.body.data.find((a: { email: string }) => a.email.toLowerCase() === email.toLowerCase());
      expect(byEmail('duplicado@ejemplo.com').submissionsFromSameEmail).toBe(2);
      expect(byEmail('unico@ejemplo.com').submissionsFromSameEmail).toBe(1);
    });

    it('GET /:id incluye internalNotes; 404 con id inexistente', async () => {
      const admin = await seedUser({ email: 'admin-apps3@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const application = await seedApplication({});

      const found = await request(app.getHttpServer())
        .get(`/api/v1/applications/${application.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(found.status).toBe(200);
      expect(found.body).toHaveProperty('internalNotes');

      const missing = await request(app.getHttpServer())
        .get(`/api/v1/applications/${NONEXISTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(missing.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/applications/:id', () => {
    it('transiciona PENDING -> ACCEPTED y fija reviewedBy/reviewedAt', async () => {
      const admin = await seedUser({ email: 'admin-apps4@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const application = await seedApplication({});

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${application.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ACCEPTED' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ACCEPTED');
      expect(response.body.reviewedById).toBeTruthy();
      expect(response.body.reviewedAt).toBeTruthy();
    });

    it('permite corregir internalNotes sin tocar status', async () => {
      const admin = await seedUser({ email: 'admin-apps5@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const application = await seedApplication({});

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${application.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ internalNotes: 'Nota interna de revisión.' });

      expect(response.status).toBe(200);
      expect(response.body.internalNotes).toBe('Nota interna de revisión.');
      expect(response.body.status).toBe('PENDING');
    });

    it('rechaza con 422 INVALID_STATUS un intento manual de CONVERTED', async () => {
      const admin = await seedUser({ email: 'admin-apps6@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const application = await seedApplication({});

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${application.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CONVERTED' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('INVALID_STATUS');
    });

    it('rechaza con 409 INVALID_STATUS_TRANSITION reabrir una postulación CONVERTED', async () => {
      const admin = await seedUser({ email: 'admin-apps7@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const speaker = await prismaTestClient.speaker.create({ data: { fullName: 'Ya Convertido' } });
      const application = await seedApplication({
        status: 'CONVERTED',
        reviewedById: admin.id,
        reviewedAt: new Date(),
        convertedSpeakerId: speaker.id,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${application.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REJECTED' });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('POST /api/v1/applications/:id/convert-to-speaker', () => {
    it('convierte una postulación aceptada, mapeando los campos sin recapturar', async () => {
      const admin = await seedUser({ email: 'admin-apps8@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const application = await seedApplication({
        status: 'ACCEPTED',
        reviewedById: admin.id,
        reviewedAt: new Date(),
        fullName: 'Postulante Aceptado',
        affiliation: 'Empresa Y',
        ideaTitle: 'Título de charla',
        ideaSummary: 'Resumen que se vuelve bio.',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/applications/${application.id}/convert-to-speaker`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        fullName: 'Postulante Aceptado',
        talkTitle: 'Título de charla',
        headline: 'Empresa Y',
        bio: 'Resumen que se vuelve bio.',
        status: 'DRAFT',
        photoUrl: null,
        photoAltText: null,
      });

      const updatedApplication = await prismaTestClient.speakerApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      expect(updatedApplication.status).toBe('CONVERTED');
      expect(updatedApplication.convertedSpeakerId).toBe(response.body.id);
    });

    it('rechaza con 404 id inexistente y con 409 si no está ACCEPTED', async () => {
      const admin = await seedUser({ email: 'admin-apps9@ucb.edu.bo', roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const pending = await seedApplication({});

      const missing = await request(app.getHttpServer())
        .post(`/api/v1/applications/${NONEXISTENT_ID}/convert-to-speaker`)
        .set('Authorization', `Bearer ${token}`);
      expect(missing.status).toBe(404);

      const wrongStatus = await request(app.getHttpServer())
        .post(`/api/v1/applications/${pending.id}/convert-to-speaker`)
        .set('Authorization', `Bearer ${token}`);
      expect(wrongStatus.status).toBe(409);
      expect(wrongStatus.body.error).toBe('INVALID_STATUS_TRANSITION');
    });
  });
});
