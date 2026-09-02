import { test, expect } from '@playwright/test';
import { cleanAllTables } from '../support/prisma-test-client';
import { cleanRateLimits } from '../support/redis-test-client';
import { seedUser } from '../support/seed-user';
import { seedEvent, seedContentBlock } from '../support/seed-content';
import { MINIMAL_VALID_PNG } from '../support/fixtures';

test.describe('content: evento, cuenta atrás y bloques de contenido', () => {
  test.beforeEach(async () => {
    await cleanAllTables();
    await cleanRateLimits();
  });

  test('sin sesión: evento y bloques de contenido reflejan lo sembrado (Historia 1)', async ({ request }) => {
    await seedEvent({ status: 'PUBLISHED', name: 'TEDxUCB E2E', startsAt: new Date(Date.now() + 60 * 60 * 1000) });
    await seedContentBlock({ key: 'linea_tematica', body: 'Sostenibilidad en sentido amplio.' });

    const eventResponse = await request.get('/api/v1/public/event');
    expect(eventResponse.status()).toBe(200);
    const eventBody = await eventResponse.json();
    expect(eventBody.event.name).toBe('TEDxUCB E2E');
    expect(eventBody.eventStatus).toBe('UPCOMING');

    const blocksResponse = await request.get('/api/v1/content-blocks');
    expect(blocksResponse.status()).toBe(200);
    const blocks = await blocksResponse.json();
    expect(blocks.some((b: { key: string }) => b.key === 'linea_tematica')).toBe(true);
  });

  test('admin reprograma el evento y el cambio se refleja sin redeploy (Historia 2)', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-content-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const event = await seedEvent({ status: 'PUBLISHED' });
    const login = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken } = await login.json();
    const newStartsAt = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();

    const patch = await request.patch(`/api/v1/events/${event.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { startsAt: newStartsAt },
    });
    expect(patch.status()).toBe(200);

    const publicEvent = await request.get('/api/v1/public/event');
    const publicBody = await publicEvent.json();
    expect(publicBody.event.startsAt).toBe(newStartsAt);
  });

  test('admin sube una imagen de evento accesible como archivo estático fuera de /api/v1', async ({ request }) => {
    const admin = await seedUser({ email: `e2e-admin-content2-${Date.now()}@ucb.edu.bo`, roles: ['ADMIN'] });
    const event = await seedEvent({ status: 'PUBLISHED' });
    const login = await request.post('/api/v1/auth/login', {
      data: { email: admin.email, password: 'unaClaveSegura9' },
    });
    const { accessToken } = await login.json();

    const upload = await request.post(`/api/v1/events/${event.id}/image`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      multipart: { file: { name: 'evento.png', mimeType: 'image/png', buffer: MINIMAL_VALID_PNG } },
    });
    expect(upload.status()).toBe(200);
    const { imageUrl } = await upload.json();

    const staticFile = await request.get(imageUrl);
    expect(staticFile.status()).toBe(200);
  });
});
