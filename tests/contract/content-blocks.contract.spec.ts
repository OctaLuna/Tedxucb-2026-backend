import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedContentBlock } from '../support/seed-content';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('Bloques de contenido (contrato, RF-202 RF-203)', () => {
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

  it('GET /content-blocks es público y lista lo sembrado', async () => {
    await seedContentBlock({ key: 'linea_tematica', body: 'Texto de la línea temática.' });

    const response = await request(app.getHttpServer()).get('/api/v1/content-blocks');

    expect(response.status).toBe(200);
    expect(response.body.some((b: { key: string }) => b.key === 'linea_tematica')).toBe(true);
  });

  it('GET /content-blocks/:key es público; 404 NOT_FOUND con clave inexistente', async () => {
    await seedContentBlock({ key: 'sobre_el_evento' });

    const found = await request(app.getHttpServer()).get('/api/v1/content-blocks/sobre_el_evento');
    expect(found.status).toBe(200);
    expect(found.body.key).toBe('sobre_el_evento');

    const missing = await request(app.getHttpServer()).get('/api/v1/content-blocks/no_existe');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });

  it('POST /content-blocks rechaza sin autenticar con 401', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .send({ key: 'nuevo_bloque', body: 'Cuerpo.' });
    expect(response.status).toBe(401);
  });

  it('un STAFF no puede crear ni editar bloques de contenido', async () => {
    const staff = await seedUser({ email: 'staff-content@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'nuevo_bloque', body: 'Cuerpo.' });

    expect(response.status).toBe(403);
  });

  it('ADMIN crea un bloque de contenido nuevo', async () => {
    const admin = await seedUser({ email: 'admin-content@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'nuevo_bloque', title: 'Nuevo', body: 'Cuerpo del bloque.' });

    expect(response.status).toBe(201);
    expect(response.body.key).toBe('nuevo_bloque');
  });

  it('rechaza con 409 DUPLICATE_KEY una clave repetida', async () => {
    const admin = await seedUser({ email: 'admin-content2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedContentBlock({ key: 'ya_existe' });

    const response = await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'ya_existe', body: 'Cuerpo.' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('DUPLICATE_KEY');
  });

  it('rechaza con 400 VALIDATION_ERROR una clave en formato inválido', async () => {
    const admin = await seedUser({ email: 'admin-content3@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'Con Mayúscula y espacio', body: 'Cuerpo.' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('ADMIN edita title/body de un bloque existente; 404 con clave inexistente', async () => {
    const admin = await seedUser({ email: 'admin-content4@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedContentBlock({ key: 'editable', body: 'Original.' });

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/content-blocks/editable')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Editado.' });
    expect(updated.status).toBe(200);
    expect(updated.body.body).toBe('Editado.');

    const missing = await request(app.getHttpServer())
      .patch('/api/v1/content-blocks/no_existe')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Da igual.' });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('NOT_FOUND');
  });

  it('crear y editar un bloque NO genera fila en audit_log (plan.md: solo se audita el Evento)', async () => {
    const admin = await seedUser({ email: 'admin-content5@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);

    await request(app.getHttpServer())
      .post('/api/v1/content-blocks')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'sin_auditar', body: 'Cuerpo.' });
    await request(app.getHttpServer())
      .patch('/api/v1/content-blocks/sin_auditar')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Editado.' });

    const auditRows = await prismaTestClient.auditLog.findMany({ where: { entityType: 'content_block' } });
    expect(auditRows).toHaveLength(0);
  });
});
