# Pruebas E2E (Playwright)

Una prueba por módulo, HTTP puro contra la API real vía `request` de
Playwright — sin navegador, sin automatización de UI (este repo no tiene
frontend). Verifican el módulo de punta a punta como lo haría un cliente HTTP
real, por encima de las pruebas de contrato/integración/unitarias de Jest que
ya exige la skill `pruebas` (`.claude/skills/pruebas/SKILL.md`).

## Convención

- Un archivo por módulo: `tests/e2e/<modulo>.e2e.spec.ts` (p. ej.
  `activities.e2e.spec.ts`, `points.e2e.spec.ts`).
- Corren contra un servidor real (`API_BASE_URL`, por defecto
  `http://localhost:3000`) y PostgreSQL real — nunca contra mocks (Artículo
  IX de `memory/constitution.md`).
- Cada prompt de `prompts/` que implementa un módulo termina corriendo
  `npx playwright test tests/e2e/<modulo>.e2e.spec.ts` y corrigiendo
  cualquier fallo antes de darse por cerrado (ver `prompts/README.md`).

## Correr las pruebas

```
npm run test:e2e
```
