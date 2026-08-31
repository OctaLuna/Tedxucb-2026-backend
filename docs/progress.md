# Progreso de implementación

Este archivo se actualiza **cada vez que se completa un prompt** de
`prompts/` — nunca antes. No reemplaza el estado de fases SDD que ya trackea
[`specs/README.md`](../specs/README.md) (spec/plan/tasks/analyze); lo
complementa con el avance real de implementación, módulo por módulo.

No se edita a mano fuera de ese cierre: cada prompt trae instrucciones
explícitas de qué fila y qué entrada de bitácora le corresponde (ver
[`prompts/README.md`](../prompts/README.md), sección "Cierre estándar").

## Estado por feature

| Feature | Spec | Plan | Tasks | Implementación |
|---|---|---|---|---|
| `001` — Identidad y usuarios | ✅ | ✅ | ✅ | ⏳ pendiente |
| `002` — Sitio público | ✅ | ⏳ pendiente | ⏳ pendiente | ⏳ pendiente |
| `003` — Motor de puntos | ✅ | ✅ | ✅ | ⏳ pendiente |
| `004` — Selección de cupos | ✅ | ⏳ pendiente | ⏳ pendiente | ⏳ pendiente |

Leyenda: ⏳ pendiente · 🔄 en curso · ✅ hecho · 🚫 bloqueado.

## Módulos

| # | Prompt | Módulo | Estado | Commit | Pruebas |
|---|---|---|---|---|---|
| 00 | `00-bootstrap-infraestructura.md` | Infraestructura base (NestJS, Prisma, Docker) | ✅ hecho | `45323e8` | Jest: 3/3 · Playwright: 1/1 |
| 001-a | `001-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Identidad | ✅ hecho | `75697a6` | — (documental) |
| 001-b | `001-b-implementacion-identidad.md` | Implementación — Identidad | ⏳ pendiente | — | — |
| 002-a | `002-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Sitio público | ⏳ pendiente | — | — |
| 002-b | `002-b-implementacion-sitio-publico.md` | Implementación — Sitio público | ⏳ pendiente | — | — |
| 003-a | `003-a-modulo-activities.md` | Módulo `activities` (actividades, staff, check-in, QR) | ⏳ pendiente | — | — |
| 003-b | `003-b-modulo-points.md` | Módulo `points` (ledger, ajustes, reversiones, reclamos) | ⏳ pendiente | — | — |
| 003-c | `003-c-modulo-leaderboard.md` | Módulo `leaderboard` (ranking, progreso, export) | ⏳ pendiente | — | — |
| 003-d | `003-d-integracion-y-pulido.md` | Integración cruzada y pulido — Motor de puntos | ⏳ pendiente | — | — |
| 004-a | `004-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Selección de cupos | ⏳ pendiente | — | — |
| 004-b | `004-b-implementacion-seleccion-cupos.md` | Implementación — Selección de cupos | ⏳ pendiente | — | — |

## Bitácora

_(más reciente primero — cada entrada la añade el prompt que se acaba de
cerrar: fecha, prompt, qué se hizo, resultado de Jest y de Playwright, hash
del commit)_

### 2026-08-31 — `001-a-clarify-plan-tasks`

Resueltos los 7 marcadores `[NECESITA CLARIFICACIÓN]` reales de `spec.md`
(el checklist decía 8; desfase corregido). Decisiones: corrección de correo
solo por el administrador; RF-108 vigencia de 7 días; RF-123 dominio
`@ucb.edu.bo`; RF-105 eliminado y RF-125 redactado sin padrón institucional
(no existe — ver **ADR-007**); RF-110 sin campo de restricciones
alimentarias; RF-128 con texto de consentimiento configurable y versionado
por el admin; RF-121 con retención indefinida.

Diseñado el ciclo técnico completo: `plan.md` valida y amplía la hipótesis
de 2 módulos a **3** (`auth`, `users`, `profiles` — `auth` se separa por ser
un dominio técnico distinto, mismo precedente que `points`/`activities` en
`003`); `data-model.md` con 9 entidades (`users`, `user_roles`,
`auth_tokens` unificada con discriminador de tipo, `student_profiles` sin
duplicar `total_points` de `003`, `faculties`, `careers`,
`consent_versions`, `consent_acceptances`, `audit_log`); 4 archivos de
`contracts/` (el de auto-registro y verificación, el de mayor riesgo de
fraude, con el mismo nivel de detalle que `checkin.md` de `003`); `tasks.md`
con 9 grupos, `T001` a `T094`.

- Sin pruebas de módulo — prompt puramente documental (no hay código
  todavía).
- Commit: `75697a6` (docs de identidad; este cierre de `progress.md` va en
  el commit siguiente).

### 2026-08-31 — `00-bootstrap-infraestructura`

Bootstrap del proyecto NestJS + Prisma + Docker Compose (Postgres 16 / Redis
7). Config tipada y validada al arrancar con `zod` (Artículo V: la app se
niega a arrancar si falta `DATABASE_URL`, `REDIS_URL` o `JWT_SECRET`, con
mensaje que nombra la variable — verificado a mano quitando `DATABASE_URL`
de `.env`: la app sale con código 1 y un mensaje explícito). Endpoint
`GET /api/v1/health` como sonda, en un `HealthModule` dedicado. Carpetas
`tests/{contract,integration,unit}` creadas. `playwright.config.ts` con
`webServer` para que `npm run test:e2e` levante el servidor solo si hace
falta.

Desvío respecto al plan original: Prisma 7.10.0 (la última versión estable
real — el dist-tag `latest` es una release candidate 8.0.0) ya no admite
`url` dentro de `datasource` en `schema.prisma`; requiere un `prisma.config.ts`
nuevo en la raíz con la URL de conexión. Se agregó ese archivo (no estaba en
la lista original de archivos a crear) y se ajustó `schema.prisma` en
consecuencia. `npx prisma generate` corrido y verificado sin necesitar
Postgres arriba.

- Jest: 3/3 (`tests/unit/config/env-validation.spec.ts`).
- Playwright: 1/1 (`tests/e2e/health.e2e.spec.ts`).
- `docker compose up -d`: ambos servicios (`postgres`, `redis`) `healthy`,
  dejados arriba para que `001-b` los use de inmediato.
- Commits: `45323e8` (bootstrap), `c4b8a11` (prueba unitaria de config),
  `4d2c113` (smoke test de salud).

Sin entradas anteriores.
