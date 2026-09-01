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
| 001-b | `001-b-implementacion-identidad.md` | Implementación — módulo `auth` | ✅ hecho | `6859adc`, `08cbd03` | Jest: 51/51 · Playwright: 2/2 |
| 001-c | `001-c-implementacion-users.md` | Implementación — módulo `users` | ✅ hecho | `81372c7`, `a9f76c8` | Jest: 88/88 · Playwright: 4/4 |
| 001-d | `001-d-implementacion-profiles.md` | Implementación — módulo `profiles` | ⏳ pendiente | — | — |
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

### 2026-09-01 — `001-c-implementacion-users` (módulo `users`)

Segundo de los 3 módulos de `001`. Consume `OneTimeTokenService`/
`PasswordHashingService`/guards de `auth` directo por import — no
reimplementa nada de ese módulo.

Migración nueva: `faculties`, `careers`, `student_profiles`,
`consent_versions` (índice único parcial `one_active_consent_version`),
`consent_acceptances`, `correction_requests`. Registro (Historia 1): crea
`users` + `student_profiles` + `consent_acceptances` + el `auth_tokens` de
verificación, todos en una sola transacción (invariante del contrato).
Revisión manual de pendientes (ADR-007, RF-126). Correcciones de campo
bloqueado (RF-112a): `studentCode`/`careerId` se aplican de inmediato,
`email` nunca se sobrescribe directo — crea un `auth_tokens` con
`new_email`, el cambio real ocurre al verificar.

**Desvío respecto a `data-model.md`:** `correction_requests` no estaba
diseñada ahí (quedó vacío en `001-a`) pero el contrato
`usuarios-y-roles.md` la exige. Diseñada ahora: `CHECK` de campo/estado,
índice único parcial `one_pending_correction_per_student_field` (mismo
patrón que `one_open_claim_per_activity` de `003`).

**Decisión de diseño explícita, no forzada por la spec:** aprobar un
registro pendiente (`POST /students/:id/approve`) activa la cuenta
directamente, igual que verificar el correo — se trata como una barrera
equivalente, no como un paso adicional obligatorio antes de la
verificación. Coherente con ADR-007 (ninguna de las barreras basta sola;
el criterio humano del admin es tan válido como el enlace de correo).

**Bugs reales encontrados y corregidos vía pruebas:**
- **`RolesGuard` ignoraba `@Roles()` puesto a nivel de clase** (solo leía
  metadata de método) — dejaba pasar a cualquier autenticado sin importar
  su rol en cualquier controlador con `@Roles()` en la clase, como
  `UsersController`. Corregido con `getAllAndOverride()`.
- `OneTimeTokenService.issue()` no podía participar en una transacción ya
  abierta por el llamador — necesario para la atomicidad del registro.
- Redis acumula estado real entre corridas repetidas de la suite E2E
  durante depuración (los límites de frecuencia son de verdad: 10 login/
  60s, 5 registros/hora) — hubo que vaciar `rate-limit:*` a mano una vez.
- Playwright corriendo varios archivos E2E en paralelo contra el mismo
  servidor y la misma base real se pisaban entre sí (mismo síntoma que ya
  forzó `maxWorkers` en Jest) — se fija `workers: 1` en
  `playwright.config.ts`.

- Jest: 88/88 (contrato, integración, unitarias — acumulado con `auth`).
- Playwright: 4/4 (`health`, `auth`, `users` ×2).
- `docker compose ps`: `postgres`/`redis` `healthy` (Docker Desktop se
  había cerrado entre sesiones; se reinició al arrancar esta).
- Commits: `4802a4f` (fix de `auth`), `81372c7` (módulo `users`),
  `a9f76c8` (pruebas).

### 2026-09-01 — `001-b-implementacion-identidad` (módulo `auth`)

`plan.md` de `001` definió 3 módulos, no 2 — siguiendo la instrucción del
propio prompt ("si el plan definió más de un módulo, divide este trabajo"),
esta sesión implementó **solo `auth`** y creó `001-c`/`001-d` para `users`/
`profiles` (sin ejecutarlos).

Migración de 5 tablas (`users`, `user_roles`, `auth_tokens`,
`refresh_tokens`, `audit_log`) con los triggers de RF-119 (nunca sin
administrador activo) y el de no-reconsumo de `auth_tokens`. Servicios
`PasswordHashingService` (Argon2id), `TokenPairService` (JWT de acceso 15
min + refresh rotativo — reusar uno ya rotado revoca toda la familia y lo
audita) y `OneTimeTokenService` (genérico, listo para que `users` lo
reutilice). `JwtAuthGuard`/`RolesGuard` manuales, sin Passport. Endpoints:
`login`, `refresh`, `logout`, `logout-all`, `accept-invitation`,
`password-reset/request` + `/confirm`, `GET /me`.

**Desvíos respecto al diseño de `001-a`, documentados:**
- **`refresh_tokens` es una tabla nueva**, no prevista en `data-model.md`:
  `auth_tokens` estaba diseñada para un único token pendiente por
  `(usuario, tipo)` — lo opuesto de una sesión multi-dispositivo.
- **`email` es `TEXT` + `CHECK (email = lower(email))` + `UNIQUE`, no
  `citext`**: Prisma excluye por completo los campos `Unsupported` de su
  API tipada (`create`/`findUnique` no pueden tocarlos) — confirmado
  inspeccionando el cliente generado, no solo la limitación de `@unique`
  que se había anticipado.
- **`@nestjs/throttler` no se instaló**: su última versión no declara
  soporte para `@nestjs/common@^12` (verificado contra el registro de
  npm). Se construyó un `RateLimitGuard` propio respaldado por Redis
  (`INCR`+`EXPIRE`, ~40 líneas).
- **`prisma migrate reset` pidió consentimiento explícito** (Prisma
  detecta que lo invoca un agente de IA y bloquea la acción sin
  confirmación humana) — se pidió y se obtuvo antes de ejecutar, sobre la
  base de desarrollo local, sin datos que perder.

**Bugs reales encontrados y corregidos vía pruebas** (no hipotéticos):
`login` sin `@HttpCode(200)`; `AllExceptionsFilter` reenviaba sin
reformatear el 400 por defecto de `ValidationPipe` porque coincidía por
casualidad con la forma de una respuesta uniforme; conexiones de Redis/
Prisma de las pruebas sin cerrar (proceso de Jest colgado indefinidamente);
Redis es un recurso real compartido entre archivos de prueba y necesita su
propia limpieza entre pruebas, a diferencia de Postgres. También: Node 24 +
Jest 30 necesitan `NODE_OPTIONS=--experimental-vm-modules` para poder
`require()` los paquetes ESM-only de Nest 12 desde pruebas en CommonJS
(agregado al script `test` vía `cross-env`); Jest corriendo en paralelo
contra la misma base compartida producía deadlocks entre archivos (`
maxWorkers: 1`).

- Jest: 51/51 (contrato, integración, unitarias).
- Playwright: 2/2 (`health.e2e.spec.ts` + `auth.e2e.spec.ts`).
- `docker compose ps`: `postgres`/`redis` `healthy`.
- Commits: `6859adc` (módulo auth), `08cbd03` (pruebas), `ccdfc6d`
  (prompts `001-c`/`001-d` y actualización de `prompts/README.md`).

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
