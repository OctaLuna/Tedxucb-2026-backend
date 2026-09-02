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
| `001` — Identidad y usuarios | ✅ | ✅ | ✅ | ✅ |
| `002` — Sitio público | ✅ | ✅ | ✅ | ✅ |
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
| 001-d | `001-d-implementacion-profiles.md` | Implementación — módulo `profiles` | ✅ hecho | `97643e8`, `3eeb7aa` | Jest: 115/115 · Playwright: 6/6 |
| 002-a | `002-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Sitio público | ✅ hecho | `8ddd311` | — (documental) |
| 002-b | `002-b-implementacion-sitio-publico.md` | Implementación — módulo `content` | ✅ hecho | `3ff6683`, `0d4365b`, `470a784` | Jest: 144/144 · Playwright: 9/9 |
| 002-c | `002-c-implementacion-speakers.md` | Implementación — módulo `speakers` | ✅ hecho | `45cd9d7`, `fed2cc7` | Jest: 185/185 · Playwright: 11/11 |
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

### 2026-09-02 — `002-c-implementacion-speakers` (módulo `speakers`) — `002` completo

Segundo y último módulo de `002` (`content` cerró en `002-b`). **Primera vez
que la feature `002` queda con Implementación ✅ completa** — segunda
feature completa del proyecto después de `001`.

Terreno nuevo: BullMQ y `nodemailer` estaban en `package.json` pero sin una
sola línea de código usándolos en todo el repo, y no había ningún servicio
de captura de correo. Se agregó **Mailpit** (`docker-compose.yml`) para
probar el envío de correo contra un servicio real — el Artículo IX prohíbe
mocks, y hubiera sido el primer mock de infraestructura del proyecto.
Verificado a mano con `curl`/SMTP crudo antes de escribir pruebas: la API
de Mailpit devuelve `{messages:[{To:[{Address}], Subject, Snippet}]}` y
`DELETE /api/v1/messages` limpia todo — confirmado el diseño antes de
comprometerlo a código.

Migración nueva: `speakers` (`CHECK published_speaker_is_complete`, mismo
patrón que `003`) y `speaker_applications` (`CHECK converted_consistency`,
`CHECK reviewed_needs_reviewer`, máquina de estados con 5 valores). Módulo
`speakers` con 4 controladores (a diferencia de `content-blocks`, que
fusiona público+admin, acá van físicamente separados por instrucción
explícita de `plan.md` — mayor riesgo de fuga, datos personales reales) y
2 servicios (`SpeakersService`, `ApplicationsService`, comparten
`PrismaService` para la conversión sin cruzar módulos). `MailModule` nuevo
en `src/common/mail/` (BullMQ + nodemailer), importado solo por
`SpeakersModule` (no duplicado en `app.module.ts` — ya lo arrastra).

**Bugs reales encontrados y corregidos, no anticipados por el diseño:**
- **Import circular entre `mail.module.ts` y `mail.service.ts`/
  `mail.processor.ts`**: ambos importaban la constante `MAIL_QUEUE` de
  vuelta desde `mail.module.ts`, que a su vez los importa a ellos — dejaba
  `MAIL_QUEUE` en `undefined` al momento de evaluar `@InjectQueue()`/
  `@Processor()`, y BullMQ caía en silencio a la cola `"default"`. Detectado
  al levantar la app manualmente (`UnknownDependenciesException:
  BullQueue_default`), no por las pruebas. Corregido moviendo la constante a
  `mail.constants.ts` propio.
- **`prisma.config.ts` seguía sin el seed conectado** (ver `002-b`) y una
  sesión de Postgres huérfana de esa corrida interrumpida seguía viva más
  de una hora sosteniendo el advisory lock de `prisma migrate` — cada
  migración nueva de este proyecto choca con el mismo lock hasta que se
  identifica y termina la sesión colgada a mano
  (`pg_terminate_backend`). Segunda vez que pasa (ya documentado en
  `002-b`) — vale la pena investigar por qué `TaskStop` no cierra limpio la
  conexión de Prisma antes de matar el proceso.
- **`{...current, ...dto}` en `SpeakersService.update()` pisaba campos ya
  guardados con `undefined`**: `class-transformer` materializa TODAS las
  propiedades declaradas de un DTO como claves presentes (con valor
  `undefined` si no vinieron en el JSON), y el spread de objetos copia esas
  claves igual — un `PATCH {status:"PUBLISHED"}` sin ningún otro campo
  volvía a marcar `headline`/`bio`/etc. como "faltantes" aunque ya
  estuvieran guardados. Corregido filtrando las claves `undefined` del DTO
  antes de fusionar con el estado actual.
- **`UpdateSpeakerDto` no tenía forma de fijar `photoAltText`**: el texto
  alternativo (RF-217) es un campo de texto que el admin escribe junto con
  la foto, no parte del archivo — hacía falta en el mismo DTO que
  `headline`/`bio`, no en el endpoint de subida de imagen. Sin él, ningún
  speaker podía llegar nunca a `PUBLISHED` por la vía normal de la API.
  Encontrado reproduciendo a mano con `curl` el flujo completo de Historia 3
  antes de confiar en la prueba automatizada.

Flujo de correo verificado de punta a punta a mano (`curl` SMTP crudo →
Mailpit) antes de escribir ninguna prueba: postulación real → job de
BullMQ → `nodemailer` → Mailpit recibe el correo con asunto y cuerpo
correctos.

- Jest: 185/185 (144 de `001`+`content` + 41 nuevas: `speakers` 15,
  `applications` 14, restricciones 5, integración de historias/concurrencia/
  duplicados 4, confirmación de correo contra Mailpit real 2).
- Playwright: 11/11 (9 previos + 2 nuevas de `speakers`, una de ellas
  verificando el correo real en Mailpit).
- `docker compose ps`: `postgres`/`redis`/`mailpit` arriba.
- `002` queda con Implementación ✅ en "Estado por feature" — feature
  completa.
- Commits: `45cd9d7` (módulo `speakers` + `MailModule`), `fed2cc7` (pruebas).

### 2026-09-02 — `002-b-implementacion-sitio-publico` (módulo `content`)

Primero de los 2 módulos de `002` (su `plan.md` los definió: `content` +
`speakers`). Diseñado con un agente Explore (snapshot exacto del código real
de `001`) y un agente Plan, revisados contra el repo antes de escribir
código — ningún hallazgo del diseño reabrió `plan.md`/`data-model.md`/
`contracts/`.

Migración nueva: `events` (`CHECK valid_status`, `CHECK capacity_positive`,
índice único parcial `one_published_event` — mismo idioma que
`one_active_consent_version` de `001`) y `content_blocks` (`CHECK
key_format`, `CHECK body_not_blank`). Módulo `content` con 3 controladores
(`PublicEventController` para `GET /public/event`, `EventsController` CRUD
admin + subida de imagen, `ContentBlocksController` mixto público/admin) y 2
servicios.

**Hallazgos reales durante la migración, no anticipados por el diseño:**
- **`prisma migrate dev --create-only` generó 9 `DROP INDEX`** de índices de
  rendimiento que `001` había agregado a mano en migraciones anteriores
  (`idx_users_status`, `idx_audit_actor`, etc.) sin declararlos como
  `@@index` en `schema.prisma` — drift preexistente entre el schema y la
  base real, no causado por este cambio. Se quitaron esos `DROP INDEX` de
  la migración de `content` (no le corresponde tocar índices de `001`); el
  drift en sí queda sin resolver (seguirá reapareciendo en la próxima
  migración de cualquier módulo hasta que alguien agregue los `@@index`
  faltantes al schema — no es parte de este prompt).
- **`prisma.config.ts` no tenía el seed conectado.** Prisma 7 movió esa
  configuración fuera de `package.json#prisma.seed` (que queda ignorado) —
  `prisma db seed`/`migrate dev` no ejecutaban `prisma/seed.ts` para nadie,
  ni siquiera para el seed de `001` (`seedTestCatalog`,
  `seedPlaceholderConsentVersion`). Corregido agregando `migrations.seed` a
  `prisma.config.ts`. Se agregaron `seedEvent()`/`seedContentBlocks()` al
  mismo archivo (fecha real 9 de noviembre, hora/sede placeholder marcados
  como tales).
- **Ningún archivo E2E de Playwright llamaba `cleanRateLimits()`** (a
  diferencia de todas las pruebas de contrato de Jest, que sí lo hacen) —
  el límite de `login` (10/60s por IP) se agota acumulado entre archivos
  porque Redis es un recurso compartido entre toda la corrida. Invisible
  hasta ahora porque el total de logins de la suite se mantenía justo por
  debajo del límite; las 2 pruebas E2E nuevas de `content` lo empujaron por
  encima y `users.e2e.spec.ts` empezó a fallar de forma intermitente
  (`POST /users` con `401` en vez de `201`, porque el login previo devolvía
  `429` sin token). Corregido agregando `cleanRateLimits()` al `beforeEach`
  de los 4 archivos E2E existentes, no solo el nuevo.

- Jest: 144/144 (115 de `001` + 29 nuevas: `content-event` 13,
  `content-blocks` 9, `content-constraints` 7).
- Playwright: 9/9 (6 de `001` + 3 nuevas de `content`).
- `docker compose ps`: `postgres`/`redis` `healthy`.
- Creado `002-c-implementacion-speakers.md` para el segundo módulo (no
  ejecutado); actualizado `prompts/README.md` (diagrama + párrafo de
  división de `002`, mismo estilo que el de `001`).
- `002` sigue con Implementación ⏳ pendiente en "Estado por feature" hasta
  que `002-c` también cierre.
- Commits: `3ff6683` (módulo `content`), `0d4365b` (pruebas), `470a784`
  (fix de `cleanRateLimits` en E2E existentes).

### 2026-09-01 — `002-a-clarify-plan-tasks`

Resueltos los 5 marcadores `[NECESITA CLARIFICACIÓN]` reales de `spec.md`
(coincide con el propio checklist — la tabla de `specs/README.md` decía 6,
desfase corregido, mismo patrón que el de `001-a`). Dos resoluciones vinieron
directas del responsable del proyecto y cambiaron el alcance del diseño: **RF-219**
(manual de marca TEDx) y **RF-220** (agenda del evento) quedaron descartadas
del backend por completo — son responsabilidad 100% de frontend/diseño, sin
entidad ni endpoint (aplicación directa de ADR-006, sin ADR nuevo). RF-213
(acuse de recibo simple) y RF-217 (sin exigencia formal de accesibilidad) se
resolvieron sin más implicación de backend que un texto alternativo por foto
de speaker. **CE-201** se dejó como deuda técnica explícita, fechada: primera
edición de TEDxUCB, sin dato histórico para fijar una meta real de
postulaciones — no se inventó un número.

Diseñado el ciclo técnico completo con un agente de diseño y revisado contra
el repo real antes de escribirlo a disco (se corrigió un error del agente:
había redactado una "resolución" de RF-218 en `spec.md` como si fuera un
marcador abierto — nunca lo fue; su único contenido real, `events.image_url`,
quedó en `plan.md`/`data-model.md`). Validadas 3 hipótesis de módulos contra
el Artículo VII (1, 2 y 3) — aceptada **2**: `content` (Evento + bloques de
contenido editable) y `speakers` (fichas + postulaciones, con
`applications.service` como servicio interno, mismo precedente que
`UsersService`+`RegistrationService` en `001/users`). `data-model.md` con 4
entidades (`events` con índice único parcial `one_published_event`,
`content_blocks` sin versionar, `speakers` con `CHECK
published_speaker_is_complete`, `speaker_applications` con
`converted_speaker_id UNIQUE` contra doble conversión concurrente); 4
archivos de `contracts/` (`evento-y-cuenta-regresiva.md` completo — resuelve
RF-204 devolviendo `startsAt`+`serverTime`+`eventStatus`, los tres calculados
por el servidor, para que el cliente nunca dependa de su propio reloj;
`postulaciones.md` completo en su parte pública, con señuelo anti-bot en vez
de captcha; `speakers.md` y `contenido.md` como índice); `tasks.md` con 8
grupos, `T001` a `T082` — incluye un `MailModule` nuevo (`src/common/mail/`,
`nodemailer` + BullMQ) porque `001` nunca implementó el envío real de correo,
solo la generación de tokens; ese mismo módulo desbloqueará después el envío
pendiente de `001`.

- Sin pruebas de módulo — prompt puramente documental (no hay código nuevo
  todavía).
- Commit: `8ddd311` (spec resuelto + plan/data-model/contracts/tasks +
  `specs/README.md`; este ajuste de hash en `progress.md` va en el commit
  siguiente, mismo patrón que `001-a`).

### 2026-09-01 — `001-d-implementacion-profiles` (módulo `profiles`) — `001` completo

Tercer y último módulo de `001`. **Primera feature con Implementación ✅
completa.** No crea tablas nuevas — todo ya migrado por `users`.

Diseño validado contra el código real ya escrito antes de implementar (no
solo el contrato), lo que cambió varias decisiones del plan inicial:

- **Avatar**: `file-type` (ya dependencia transitiva de
  `@nestjs/common@12.0.1` — el propio Nest lo usa en su
  `FileTypeValidator` interno, y el flag ESM que hacía falta ya estaba
  puesto desde `001-b`) en vez de un util de magic bytes a mano.
  `multer` `memoryStorage` + `useStaticAssets` de
  `@nestjs/platform-express` para servir avatares, sin
  `@nestjs/serve-static` (Artículo VIII: no envolver algo que el
  framework ya expone directo). `file-type` no resuelve con
  `moduleResolution: "node"` (usa `exports` condicional en su
  `package.json`) — shim de tipos acotado en `src/types/file-type.d.ts`
  en vez de cambiar la configuración global de TypeScript a mitad de
  proyecto.
- **Rutas `/students` en dos módulos distintos** (`users`: `pending`/
  `approve`/`reject`; `profiles`: listado/detalle/`export`): defensa en
  3 capas (orden de `imports` en `app.module.ts`, orden de métodos
  dentro de la clase, `ParseUUIDPipe` en `:id`) más una prueba de
  integración que confirma que `/students/pending` sigue cayendo en el
  handler de `users` — la única defensa real contra una regresión
  silenciosa si alguien reordena los imports en el futuro.
- **`totalPoints`** (columna que agrega `003`, no implementada):
  `null` explícito, nunca se omite la clave — enmienda fechada en
  `contracts/perfil-y-catalogo.md` en vez de dejar la spec divergir del
  código en silencio.
- **`PATCH /me/profile` en `PENDING`**: permite corregir
  `studentCode`/`careerId` libremente (RF-112 se deriva de
  `users.status`, no es columna), reutilizando el patrón exacto de
  `registration.service.ts` (`422 INVALID_CAREER`, `409 DUPLICATE_FIELD`
  con doble capa contra condición de carrera). Estos dos modos de fallo
  no estaban en el contrato original — también enmendado.
  `isUniqueConstraintViolation` se extrajo a `common/utils/` (ya se
  repetía en 3 servicios).
- **Exportación CSV** a mano, con BOM UTF-8 (sin esto, Excel en Windows
  rompe tildes/`ñ`) y campos siempre citados; auditada
  (`STUDENTS_EXPORTED`).
- **`GET /public/consent-version`** con `RateLimitGuard` — la skill
  `seguridad-y-roles` exige límite propio en todo `/public/*`, y no
  estaba contemplado en el diseño inicial.

**Bugs reales encontrados y corregidos vía pruebas:**
- `POST /me/avatar` sin `@HttpCode(200)` (Nest devuelve 201 por
  defecto en POST).
- **`AllExceptionsFilter` nunca capturaba el `413` de un archivo
  demasiado grande**: Nest ya traduce el `MulterError` de
  `LIMIT_FILE_SIZE` a su propia `PayloadTooLargeException` dentro de
  `FileInterceptor`, antes de que la excepción llegue al filtro — un
  `instanceof MulterError` ahí nunca matchea (caía en `HTTP_ERROR`
  genérico). Corregido capturando `PayloadTooLargeException`.
- **`playwright.config.ts` rompía la subida de avatar solo en E2E**:
  fijaba `Content-Type: application/json` global vía
  `extraHTTPHeaders`, que pisaba el `multipart/form-data;
  boundary=...` que Playwright arma automáticamente para `multipart:
  {...}`. La misma petición funcionaba con `curl` directo contra el
  mismo servidor — confirma que era un problema de la config de
  pruebas, no del código de la app. Se quitó el header fijo; Playwright
  ya calcula el `Content-Type` correcto según la opción usada.

- Jest: 115/115 (acumulado con `auth` + `users`).
- Playwright: 6/6 (`health`, `auth`, `users` ×2, `profiles` ×2).
- `docker compose ps`: `postgres`/`redis` `healthy` (Docker Desktop se
  había cerrado entre sesiones otra vez; se reinició al arrancar esta).
- Commits: `97643e8` (módulo `profiles`), `3eeb7aa` (pruebas).

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
