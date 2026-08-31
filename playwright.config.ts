import { defineConfig } from '@playwright/test';

/**
 * Pruebas E2E por módulo: HTTP puro contra la API vía el fixture `request`
 * de Playwright, sin navegador. Complementan (no reemplazan) las pruebas de
 * contrato/integración/unitarias de Jest que exige la skill `pruebas`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.API_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
