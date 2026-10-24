import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits, closeRedisTestClient } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedStudent, seedCareer } from '../support/seed-catalog';
import { seedEvent } from '../support/seed-content';
import { grantEventAccess, seedTestEvent } from '../support/seed-events';

async function loginAs(app: INestApplication, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'unaClaveSegura9' });
  return response.body.accessToken as string;
}

describe('GET /api/v1/students (contrato, RF-113/114/115/120)', () => {
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
    await seedEvent();
  });

  it('lista alumnos con saldo cero para el evento sin movimientos', async () => {
    const admin = await seedUser({ email: 'admin@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedStudent({ email: 'alumno@ucb.edu.bo', fullName: 'Alumno Uno' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ fullName: 'Alumno Uno', totalPoints: 0 });
  });

  it('filtra por carrera y por texto libre (nombre o código)', async () => {
    const admin = await seedUser({ email: 'admin2@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { career } = await seedCareer({ careerName: 'Ingeniería de Sistemas' });
    const { user: match } = await seedStudent({
      email: 'coincide@ucb.edu.bo',
      fullName: 'María Coincide',
      careerId: career.id,
    });
    await seedStudent({ email: 'nocoincide@ucb.edu.bo', fullName: 'Otro Alumno' });

    const byCareer = await request(app.getHttpServer())
      .get(`/api/v1/students?career=${career.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(byCareer.body.data).toHaveLength(1);
    expect(byCareer.body.data[0].id).toBe(match.id);

    const bySearch = await request(app.getHttpServer())
      .get('/api/v1/students?search=Coincide')
      .set('Authorization', `Bearer ${token}`);
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].id).toBe(match.id);
  });

  it('rechaza con 403 a un STAFF (RF-115)', async () => {
    const staff = await seedUser({ email: 'staff@ucb.edu.bo', roles: ['STAFF'] });
    const token = await loginAs(app, staff.email);

    const response = await request(app.getHttpServer())
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('GET /students/:id devuelve el detalle individual', async () => {
    const admin = await seedUser({ email: 'admin3@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user } = await seedStudent({ email: 'detalle@ucb.edu.bo', fullName: 'Detalle Alumno' });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.fullName).toBe('Detalle Alumno');
  });

  it('GET /students/export devuelve un CSV con BOM UTF-8 y campos citados, y queda auditado', async () => {
    const admin = await seedUser({ email: 'admin4@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedStudent({ email: 'export@ucb.edu.bo', fullName: 'José Ñáñez' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/students/export')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    expect(response.text).toContain('"José Ñáñez"');

    const audit = await prismaTestClient.auditLog.findFirst({ where: { action: 'STUDENTS_EXPORTED' } });
    expect(audit).not.toBeNull();
  });

  it('limita la vista administrativa de perfiles externos al evento en su whitelist', async () => {
    await seedTestEvent('innovation-week');
    const admin = await seedUser({ email: 'admin-event-students@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    const { user: external } = await seedStudent({ email: 'externo-students@example.com' });
    await grantEventAccess(external.email, 'tedxucb');

    const tedx = await request(app.getHttpServer()).get('/api/v1/students?eventSlug=tedxucb')
      .set('Authorization', `Bearer ${token}`).expect(200);
    const innovation = await request(app.getHttpServer()).get('/api/v1/students?eventSlug=innovation-week')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(tedx.body.data.map((row: { id: string }) => row.id)).toContain(external.id);
    expect(innovation.body.data).toHaveLength(0);

    await request(app.getHttpServer()).get(`/api/v1/students/${external.id}?eventSlug=innovation-week`)
      .set('Authorization', `Bearer ${token}`).expect(404);
  });

  // Capa 4 de la defensa de rutas: `users` declara @Controller('students')
  // con GET 'pending' registrado ANTES que el @Controller('students') de
  // `profiles` (ProfilesModule se importa después de UsersModule en
  // app.module.ts) -- esta prueba falla ruidosamente si alguien reordena
  // los imports y 'pending' termina cayendo en el handler ':id' de profiles.
  it('GET /students/pending sigue respondiendo la revisión de `users`, no el detalle de `profiles`', async () => {
    const admin = await seedUser({ email: 'admin5@ucb.edu.bo', roles: ['ADMIN'] });
    const token = await loginAs(app, admin.email);
    await seedStudent({ email: 'pendiente@ucb.edu.bo', status: 'PENDING' });

    const response = await request(app.getHttpServer())
      .get('/api/v1/students/pending')
      .set('Authorization', `Bearer ${token}`);

    // La forma de users.listPendingStudents() es paginada {data, meta};
    // si 'pending' hubiera caído en profiles' :id con ParseUUIDPipe,
    // esto habría sido 400 (UUID inválido), nunca 200 con esta forma.
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe('PENDING');
  });
});
