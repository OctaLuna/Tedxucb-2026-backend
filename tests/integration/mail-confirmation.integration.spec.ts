import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb } from '../support/prisma-test-client';
import { closeRedisTestClient } from '../support/redis-test-client';
import { clearMailpit, waitForMailpitMessage } from '../support/mailpit-client';
import { ApplicationsService } from '../../src/modules/speakers/applications.service';
import { seedEvent } from '../support/seed-content';

/**
 * Sin mocks (Artículo IX): invoca ApplicationsService directo (sin HTTP,
 * Artículo I) y verifica la entrega real contra Mailpit -- el correo pasa
 * de verdad por BullMQ (Worker real, arranca junto con AppModule) y
 * nodemailer (SMTP real hacia Mailpit, ver docker-compose.yml).
 */
describe('Confirmación de postulación por correo (integración, sin mocks)', () => {
  let app: INestApplication;
  let applicationsService: ApplicationsService;

  beforeAll(async () => {
    app = await createTestApp();
    applicationsService = app.get(ApplicationsService);
  });

  afterAll(async () => {
    await app.close();
    await closeRedisTestClient();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await clearMailpit();
    await seedEvent();
  });

  it('encola y entrega un correo real con el nombre del postulante', async () => {
    const email = `confirmacion-${Date.now()}@ejemplo.com`;

    await applicationsService.create(
      {
        fullName: 'Postulante Correo Real',
        email,
        affiliation: 'Empresa Correo',
        expertiseArea: 'Área',
        ideaTitle: 'Idea',
        ideaSummary: 'Resumen',
        evidenceBasis: 'Evidencia',
        applicability: 'Aplicabilidad',
      },
      '127.0.0.1',
    );

    const message = await waitForMailpitMessage((msg) => msg.To.some((to) => to.Address === email));

    expect(message.Subject).toBe('Recibimos tu postulación para TEDxUCB');
    expect(message.Snippet).toContain('Postulante Correo Real');
  });

  it('el señuelo no encola ningún correo', async () => {
    const email = `senuelo-${Date.now()}@ejemplo.com`;

    await applicationsService.create(
      {
        fullName: 'No Debería Enviarse',
        email,
        affiliation: 'Empresa',
        expertiseArea: 'Área',
        ideaTitle: 'Idea',
        ideaSummary: 'Resumen',
        evidenceBasis: 'Evidencia',
        applicability: 'Aplicabilidad',
        website: 'http://bot.example.com',
      },
      '127.0.0.1',
    );

    await expect(
      waitForMailpitMessage((msg) => msg.To.some((to) => to.Address === email), { timeoutMs: 1500 }),
    ).rejects.toThrow();
  });
});
