import { defineConfig } from '@playwright/test';

/**
 * Pruebas E2E por módulo: HTTP puro contra la API vía el fixture `request`
 * de Playwright, sin navegador. Complementan (no reemplazan) las pruebas de
 * contrato/integración/unitarias de Jest que exige la skill `pruebas`.
 *
 * `workers: 1`: todos los archivos corren contra el mismo servidor real y
 * la misma base real (a diferencia de Jest, que levanta una app por
 * archivo) -- algunos truncan tablas compartidas entre pruebas (Artículo
 * IX: base limpia entre pruebas), así que dos archivos en paralelo pueden
 * pisarse el uno al otro (confirmado: auth.e2e y users.e2e fallando de
 * forma intermitente en paralelo, mismo síntoma que ya forzó
 * `maxWorkers: 1` en Jest).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
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
