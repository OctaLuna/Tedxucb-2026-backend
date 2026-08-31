import { test, expect } from '@playwright/test';

test('GET /api/v1/health responde 200 con { status: "ok" }', async ({ request }) => {
  const response = await request.get('/api/v1/health');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
