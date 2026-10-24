import { grantEventAccess, seedTestEvent } from '../support/seed-events';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedActivityCategory } from '../support/seed-activities';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

/**
 * Auditoría T101 (003-d): este endpoint existe desde 003-a
 * (contracts/activities.md) pero nunca tuvo pruebas de contrato -- hueco
 * real encontrado al auditar contratos vs código, no solo un ajuste de
 * documentación.
 */
describe('activity-categories (contrato, RF-310a RF-310b, T101)', () => {
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
    await seedTestEvent();
  });

  describe('GET /api/v1/activity-categories', () => {
    it('rechaza sin autenticar con 401', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/activity-categories');
      expect(response.status).toBe(401);
    });

    it('cualquier rol autenticado ve el catálogo completo, ordenado por nombre', async () => {
      const staff = await seedUser({ email: `staff-categorias-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      await grantEventAccess(staff.email);
      const token = await loginAs(app, staff.email);
      await seedActivityCategory({ name: 'Zumba', suggestedPoints: 5 });
      await seedActivityCategory({ name: 'Ajedrez', suggestedPoints: 8 });

      const response = await request(app.getHttpServer())
        .get('/api/v1/activity-categories')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.map((c: { name: string }) => c.name)).toEqual(['Ajedrez', 'Zumba']);
    });

    it('repeats category names safely across events', async () => {
      const admin = await seedUser({ email: `admin-categorias-eventos-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      await seedTestEvent('innovation-week');
      await request(app.getHttpServer()).post('/api/v1/activity-categories').query({ eventSlug: 'tedxucb' })
        .set('Authorization', `Bearer ${token}`).send({ name: 'Talleres' }).expect(201);
      await request(app.getHttpServer()).post('/api/v1/activity-categories').query({ eventSlug: 'innovation-week' })
        .set('Authorization', `Bearer ${token}`).send({ name: 'Talleres' }).expect(201);

      const tedx = await request(app.getHttpServer()).get('/api/v1/activity-categories?eventSlug=tedxucb')
        .set('Authorization', `Bearer ${token}`);
      const week = await request(app.getHttpServer()).get('/api/v1/activity-categories?eventSlug=innovation-week')
        .set('Authorization', `Bearer ${token}`);
      expect(tedx.body).toHaveLength(1);
      expect(week.body).toHaveLength(1);
      expect(tedx.body[0].id).not.toBe(week.body[0].id);
    });
  });

  describe('POST /api/v1/activity-categories', () => {
    it('rechaza con 403 a un STAFF', async () => {
      const staff = await seedUser({ email: `staff-crear-categoria-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/activity-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Taller', color: '#4CAF50', suggestedPoints: 10 });

      expect(response.status).toBe(403);
    });

    it('un ADMIN crea una categoría con valor sugerido (RF-310a)', async () => {
      const admin = await seedUser({ email: `admin-crear-categoria-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .post('/api/v1/activity-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Taller ${Date.now()}`, color: '#4CAF50', suggestedPoints: 10 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ color: '#4CAF50', suggestedPoints: 10 });
    });

    it('rechaza con 409 DUPLICATE_CATEGORY un nombre ya usado', async () => {
      const admin = await seedUser({ email: `admin-categoria-duplicada-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const category = await seedActivityCategory();

      const response = await request(app.getHttpServer())
        .post('/api/v1/activity-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: category.name });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('DUPLICATE_CATEGORY');
    });
  });

  describe('PATCH /api/v1/activity-categories/:id', () => {
    it('rechaza con 403 a un STAFF', async () => {
      const staff = await seedUser({ email: `staff-editar-categoria-${Date.now()}@ucb.edu.bo`, roles: ['STAFF'] });
      const token = await loginAs(app, staff.email);
      const category = await seedActivityCategory();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/activity-categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ suggestedPoints: 15 });

      expect(response.status).toBe(403);
    });

    it('un ADMIN edita suggestedPoints/color', async () => {
      const admin = await seedUser({ email: `admin-editar-categoria-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const category = await seedActivityCategory({ suggestedPoints: 5 });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/activity-categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ suggestedPoints: 20 });

      expect(response.status).toBe(200);
      expect(response.body.suggestedPoints).toBe(20);
    });

    it('rechaza con 404 NOT_FOUND un id inexistente (bug real corregido en la auditoría T101)', async () => {
      const admin = await seedUser({ email: `admin-categoria-404-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);

      const response = await request(app.getHttpServer())
        .patch('/api/v1/activity-categories/3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10')
        .set('Authorization', `Bearer ${token}`)
        .send({ suggestedPoints: 20 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('rechaza con 409 DUPLICATE_CATEGORY si el nuevo nombre ya lo usa otra categoría', async () => {
      const admin = await seedUser({ email: `admin-categoria-409-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
      const token = await loginAs(app, admin.email);
      const first = await seedActivityCategory();
      const second = await seedActivityCategory();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/activity-categories/${second.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: first.name });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('DUPLICATE_CATEGORY');
    });
  });
});
