import { test, expect } from '@playwright/test';
import { cleanAllTables, prismaTestClient } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { clearMailpit, waitForMailpitMessage } from '../support/mailpit-client';

test.describe('speakers: fichas, postulaciones y conversión', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
    await clearMailpit();
  });

  test('un speaker no publicado no aparece por ningún medio público', async ({ request }) => {
    const draft = await prismaTestClient.speaker.create({ data: { fullName: 'No Publicado' } });

    const publicList = await request.get('/api/v1/public/speakers');
    const listBody = await publicList.json();
    expect(listBody.map((s: { id: string }) => s.id)).not.toContain(draft.id);
  });

  test('postulación pública se confirma con un correo real y se convierte sin recapturar datos', async ({
    request,
  }) => {
    const admin = await seedUser({ email: `e2e-admin-speakers-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const login = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken } = await login.json();

    const applicantEmail = `e2e-postulante-${Date.now()}@ejemplo.com`;
    const submitted = await request.post('/api/v1/public/applications', {
      data: {
        fullName: 'Postulante E2E',
        email: applicantEmail,
        affiliation: 'Organización E2E',
        expertiseArea: 'Tecnología',
        ideaTitle: 'Título E2E',
        ideaSummary: 'Resumen E2E',
        evidenceBasis: 'Evidencia E2E',
        applicability: 'Aplicabilidad E2E',
      },
    });
    expect(submitted.status()).toBe(201);
    const applicationId = (await submitted.json()).id as string;

    const message = await waitForMailpitMessage((msg) => msg.To.some((to) => to.Address === applicantEmail));
    expect(message.Subject).toBe('Recibimos tu postulación para TEDxUCB');

    const accepted = await request.patch(`/api/v1/applications/${applicationId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { status: 'ACCEPTED' },
    });
    expect(accepted.status()).toBe(200);

    const converted = await request.post(`/api/v1/applications/${applicationId}/convert-to-speaker`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(converted.status()).toBe(201);
    const speaker = await converted.json();
    expect(speaker.fullName).toBe('Postulante E2E');
    expect(speaker.talkTitle).toBe('Título E2E');
    expect(speaker.status).toBe('DRAFT');
  });
});
