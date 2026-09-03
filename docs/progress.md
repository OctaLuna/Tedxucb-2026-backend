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
| 003-a | `003-a-modulo-activities.md` | Módulo `activities` (actividades, staff, check-in, QR) | ✅ hecho | `bce9029`, `a81e9df`, `f73a48a`, `185aad2` | Jest: 234/234 · Playwright: 14/14 |
| 003-b | `003-b-modulo-points.md` | Módulo `points` (ajustes, reversiones, reconciliación, `points-cli`) | ✅ hecho | `7122cf8`, `db162be`, `65b9794`, `4840a80`, `2f0c202` | Jest: 262/262 · Playwright: 15/15 |
| 003-c | `003-c-modulo-leaderboard.md` | Módulo `leaderboard` (ranking, progreso, export) | ✅ hecho | `0c02104`, `c34ad83`, `6965558`, `606852c` | Jest: 276/276 · Playwright: 17/17 |
| 003-d | `003-d-integracion-y-pulido.md` | Integración cruzada y pulido — Motor de puntos | ⏳ pendiente | — | — |
| 004-a | `004-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Selección de cupos | ⏳ pendiente | — | — |
| 004-b | `004-b-implementacion-seleccion-cupos.md` | Implementación — Selección de cupos | ⏳ pendiente | — | — |

## Bitácora

_(más reciente primero — cada entrada la añade el prompt que se acaba de
cerrar: fecha, prompt, qué se hizo, resultado de Jest y de Playwright, hash
del commit)_

### 2026-09-02 — `003-c-modulo-leaderboard` (módulo `leaderboard`)

Tercer y último módulo de negocio de `003-motor-de-puntos` (de los 3 que
permite el Artículo VII para esta feature). Sin marcadores de clarify
pendientes — RF-342 ya se había resuelto en `003-a` (ranking visible a
todos los autenticados). Lee `student_profiles.total_points` (la caché de
`003-a`/`003-b`), nunca recalcula sumando el ledger en cada consulta.

**Tres huecos reales en `contracts/points-and-leaderboard.md`, sección
Ranking**, mismo tipo de hallazgo que las rondas anteriores: no tenía tabla
de modos de fallo en absoluto (ni para `/leaderboard` ni para
`/leaderboard/export`); no aclaraba el `limit` por defecto ni que —a
diferencia del resto de listados de la API— **no es paginado** (top-N por
`limit`, sin `page`/`totalPages`, decisión ya tomada en el contrato
original, solo sin explicitar); y no describía el formato exacto del CSV de
exportación. Enmendado con fecha 2026-09-02 antes de escribir código
(Artículo IX).

`LeaderboardService.getLeaderboard()`/`getStudentProgress()`/`exportCsv()`
con `RANK() OVER` vía `$queryRaw` (Prisma no expresa funciones de ventana),
usando `Prisma.sql`/`Prisma.join` para los filtros `career`/`faculty` en
vez de concatenar strings a mano. Desempate determinista (RF-339): quien
alcanzó el puntaje primero, vía `MAX(point_transactions.created_at)` del
alumno. `GET /me/progress`: si el propio alumno no aparece en la población
clasificada (`status <> 'ACTIVE'`), `rank: null` en vez de fallar —
escenario real y alcanzable, no hipotético: el access token de 15 minutos
no es revocable dentro de su ventana (skill `seguridad-y-roles`), así que
un alumno recién deshabilitado por un admin puede seguir consultando su
progreso con un token todavía vigente hasta que expire.

**T093 (CE-301, CE-304), añadido a `activities` por decisión explícita del
propio prompt** (no es de `leaderboard`, pero cierra junto a este módulo):
`GET /activities/metrics` (nuevo, `ADMIN`, contrato agregado a
`contracts/activities.md`) calcula `manualRatio` en vivo desde
`attendances` (CE-304, cobertura real). CE-301 (latencia desde que el staff
abre el escáner hasta la confirmación en pantalla) **no es enteramente
medible desde el backend** — incluye tiempo de cliente, fuera de este
repositorio (ADR-006); se agregó solo una línea de log estructurada con la
duración del `POST .../checkin` en `CheckinService`, sin tabla ni endpoint
de agregación nuevos — no existe infraestructura de métricas en este
proyecto (sin Prometheus/StatsD) y construir una para un solo número es
exactamente la anticipación que prohíbe el Artículo VII. Documentado así,
explícitamente, en vez de fingir un p95 real que nadie puede consultar.

`GET /leaderboard/export`: CSV con BOM UTF-8, mismo patrón exacto que
`StudentsService.exportCsv` de `profiles` (001-d, incluida la razón del
BOM: Excel en Windows rompe tildes/ñ sin él) — columnas
`Posición,Código,Nombre,Carrera,Facultad,Puntos`, auditado
(`LEADERBOARD_EXPORTED`, acceso masivo al padrón). Ruta `metrics` de
`activities` declarada **antes** de `:id` en el controlador — mismo motivo
ya documentado para `export` en `students.controller.ts` (001-d):
`ParseUUIDPipe` la habría convertido en un 400 si quedaba después.

- Jest: 276/276 (262 de `001`+`002`+`003-a`+`003-b` + 14 nuevas: contrato
  `leaderboard` 7, contrato `me/progress` 4, contrato `activities/metrics`
  2, integración de desempate determinista 1).
- Playwright: 17/17 (15 previos + 2 nuevas de `leaderboard`).
- `003` sigue con Implementación ⏳ pendiente en "Estado por feature" hasta
  que `003-d` también cierre (integración cruzada de los tres módulos, T080-
  T086, y el escenario 13 de campo).
- Commits: `0c02104` (enmienda de contratos), `c34ad83` (módulo
  `leaderboard`), `6965558` (`activities` T093: métricas + log de
  duración), `606852c` (pruebas).

### 2026-09-02 — `003-b-modulo-points` (módulo `points`)

Segundo módulo de `003-motor-de-puntos`. No repite la migración de `003-a`
(`point_transactions`, el trigger de inmutabilidad, `student_profiles.
total_points`) — la verifica y construye encima, reutilizando
`LedgerService.recordMovement`/`reverseMovement` tal cual (sin tocar su
firma). Antes de escribir código, leí también `prompts/003-c-modulo-
leaderboard.md` y `prompts/003-d-integracion-y-pulido.md` para no invadir
su alcance: `GET /me/progress` es de `003-c`, y las pruebas de integración
cruzada T080/T082/T083/T084/T086 están reservadas explícitamente a `003-d`
(corren después de que los tres módulos existan). Esto acotó bastante el
trabajo de pruebas de esta ronda — el propio prompt de `003-b` solo pide
una verificación **manual** de `points-cli reconcile --fix` en su cierre,
no un test automatizado.

Tres huecos reales en `contracts/points-and-leaderboard.md` (mismo tipo de
hallazgo que motivó `contracts/activities.md` en `003-a`), corregidos antes
de implementar: faltaban `404 NOT_FOUND` en `POST /points/adjustments` y en
`POST /points/:transactionId/reverse`, `400 REASON_REQUIRED` en este último
(RF-330 exige motivo también para revertir, el `CHECK
manual_types_need_reason` incluye `REVERSAL`), y un ejemplo de respuesta
exitosa para la reversión.

**Refactor necesario, ya anticipado por un comentario propio de `002-c`**:
`mail.module.ts` decía textualmente *"si otro módulo necesita una cola en
el futuro, se promueve a `app.module.ts` entonces"* — `points` necesitaba
su propia cola (`points-reconciliation`, BullMQ) para el job diario de
reconciliación, así que `BullModule.forRootAsync` se movió de `mail.module.ts`
a `app.module.ts`; cada módulo con cola propia ahora solo hace
`BullModule.registerQueue({name})` sobre esa conexión compartida. Verificado
en aislamiento (suite completa en verde) antes de seguir con código nuevo.

**Decisión de diseño explícita**: `points` no cambia la firma de
`LedgerService.recordMovement` para exponer `truncated`/`newTotal` (ya
probada y committeada en `003-a`) — en vez de eso, `PointsAdjustmentsService`
lee `total_points` antes y después de la misma transacción, un query extra
barato, para derivar el truncamiento sin tocar infraestructura compartida.

**`points-cli` (T046, Artículo II)**: `src/cli/points-cli.ts`, ejecutado
con `ts-node` vía `NestFactory.createApplicationContext(AppModule)` — el
mismo `AppModule` real, sin bootstrap duplicado. `--fix` exige `--operator
<email>` resuelto contra un `ADMIN` real, para que la corrección quede
auditada a nombre de alguien (RF-330/skill `seguridad-y-roles`). El job
programado (T092) **solo alerta** (`Logger.error` + `audit_log`, `actorId:
null`): RF-332 (verificar y alertar) y RF-333 (permitir recalcular) son
operaciones deliberadamente distintas, la única vía que escribe es el CLI
con un operador identificado.

**Bug real encontrado y corregido, no anticipado por el diseño**: al
ejecutar `points-cli` por primera vez, `ts-node` falló con `Cannot find
module 'file-type'` — el shim de tipos de `src/types/file-type.d.ts` (ver
`001-d`) nunca se había puesto a prueba fuera de `nest build`/`nest start`,
que sí lo resuelven. `prisma/seed.ts`, el único script `ts-node` previo del
proyecto, nunca importa `AppModule` completo y por eso nunca lo expuso.
Causa real: `ts-node` en modo por defecto NO incluye archivos `.d.ts`
ambientales que ningún archivo importa directo (a diferencia de `tsc`, que
sí los incluye por el `include` implícito del proyecto) — corregido con la
opción documentada `"ts-node": {"files": true}` en `tsconfig.json`. Suite
de Jest y `nest build` reconfirmados en verde después del cambio (no usan
la misma ruta de resolución de `ts-node`, así que no era un efecto
garantizado).

Verificación manual de `points-cli` (escenario 11 de `quickstart.md`, tal
como pide el cierre del prompt): sembrado un alumno con `total_points`
alterado a mano (`999` contra un ledger real de `30`); `reconcile --student
--json` lo reportó (`consistent: false`); `--fix --operator <admin
real>` lo corrigió y `audit_log` quedó con la fila
`RECONCILIATION_FIX_APPLIED` (`before: 999, after: 30`, `actor_id` del
admin resuelto); `--fix --operator <email inexistente>` se rechazó antes
de tocar nada; `reconcile --all` después de la corrección devolvió `[]`.
Datos de la verificación limpiados de la base de desarrollo al terminar.

- Jest: 262/262 (234 de `001`+`002`+`003-a` + 28 nuevas de `points`:
  contrato 17, integración 4, unitaria 7).
- Playwright: 15/15 (14 previos + 1 nueva de `points`).
- `docker compose ps`: `postgres`/`redis`/`mailpit` `healthy`.
- `003` sigue con Implementación ⏳ pendiente en "Estado por feature" hasta
  que `003-c`/`003-d` también cierren.
- Commits: `7122cf8` (enmienda de contrato), `db162be` (refactor de BullMQ),
  `65b9794` (módulo `points`: servicios, endpoints, auditoría,
  reconciliación programada), `4840a80` (`points-cli` + fix de `ts-node`),
  `2f0c202` (pruebas).

### 2026-09-02 — `003-a-modulo-activities` (módulo `activities`)

Primer módulo de `003-motor-de-puntos`, la feature de mayor riesgo del
proyecto: decide quién de los alumnos ocupa las 80 butacas del auditorio.
El prompt exigió, como Paso 0, resolver 5 marcadores `[NECESITA
CLARIFICACIÓN]` (T001-T005) antes de tocar código. Una respuesta (T005)
resultó ser un **cambio de alcance real**, no una decisión puntual: se
elimina toda la Historia 5 (reclamos: entidad `PointClaim`, endpoints
`/claims`, RF-334-337) y el concepto de "fecha de corte" del ranking — el
alumno que crea que le falta un punto lo reporta por canal informal, el
admin lo resuelve con un `BONUS`/`ADJUSTMENT` manual auditado, y el ledger
de solo inserción ya da la trazabilidad que un canal formal habría dado.
Documentado en **ADR-008**. La ronda también resolvió: T001 (ranking
completo visible para todos, RF-342), T002 (sin umbral fijo de anomalía —
T090 queda como deuda técnica explícita, no bloqueante), T003 (no existen
actividades masivas — RF-323), T004 (actividades sin límite de asistentes,
solo puntos por alumno; vigencia del token QR 60s). Cascada de enmiendas a
`spec.md`, `data-model.md`, `plan.md`, `contracts/checkin.md`,
`contracts/points-and-claims.md` (renombrado a
`points-and-leaderboard.md`), `tasks.md`, `quickstart.md`, y a los prompts
`003-b`/`003-c`/`003-d` para que dejen de referenciar lo eliminado. Se
escribió `contracts/activities.md`, que nunca había existido pese a que
RF-301 a RF-310c lo exigían (Artículo IX: contrato antes que código).

Migración `activities`/`activity_staff`/`attendances`/`point_transactions`
(detalle en el commit `bce9029`) con las cinco garantías de la skill
`motor-de-puntos` en el esquema, no solo en el servicio: índice único
parcial, `idempotency_key` única, `CHECK (total_points >= 0)`, trigger
`forbid_ledger_mutation`. `LedgerService` nuevo en `src/common/ledger/` —
decisión propia, distinta de la sugerida por el agente de diseño (que
proponía dejarlo temporalmente dentro de `activities/`): es infraestructura
compartida real, no cuenta contra el límite de 3 módulos por feature, y
evita un archivo "temporal" que en la práctica nunca se relocaliza. `003-b`
lo reutilizará tal cual para ajustes/bonos/penalizaciones.

**Hallazgos y decisiones reales durante el diseño y la implementación:**
- **Bug real en `data-model.md` original**: el índice único que impedía el
  doble check-in ignoraba `allow_multiple_checkins`, violando RF-315.
  Corregido añadiendo `multiple_allowed` denormalizado a `attendances`
  (copiado de la actividad al insertar, mismo patrón que ya usa
  `points_value` para RF-306).
- **Contrato de idempotencia original prometía una distinción imposible**:
  `checkin.md` distinguía 200 (reintento propio) de 409 (duplicado ajeno),
  pero el índice único de `attendances` dispara siempre antes que la clave
  de idempotencia del ledger (mismo orden de inserción fijado), así que esa
  distinción no es mecánicamente alcanzable. Reescrito: cualquier repetición
  — propia o ajena — es `409 ALREADY_CHECKED_IN` con los datos del registro
  previo. Simplificó también el código real: sin rama de replay a 200.
- **Bug de idempotencia propio, encontrado escribiendo la prueba de
  `allowMultipleCheckins=true`**: la clave `checkin:{activityId}:
  {studentId}` es idéntica para dos escaneos legítimos del mismo alumno
  cuando la actividad admite registros múltiples, y el segundo chocaba
  contra la restricción única aunque fuera válido. Corregido omitiendo la
  clave (`undefined`) en ese caso — Postgres permite múltiples `NULL` bajo
  `UNIQUE`. Limitación conocida y deliberada, documentada en el código: sin
  `allowMultipleCheckins` (el caso real, ya que T003 resolvió que no hay
  actividades masivas) la protección de idempotencia sigue intacta.
- **El `REVOKE UPDATE, DELETE ON point_transactions FROM ted` de la
  migración es efectivamente decorativo**: el rol `ted` es dueño de la
  tabla (la crea vía `migrate`), y en Postgres el dueño de una tabla se
  salta cualquier `GRANT`/`REVOKE` sobre ella propia. La protección real es
  solo el trigger `forbid_ledger_mutation`. Se deja documentado como
  límite conocido, no oculto — separar un segundo rol de Postgres sin
  *ownership* es infraestructura nueva, fuera de alcance de este módulo.
- **Dos bugs propios en las pruebas, no en el código de producción**: el
  helper `seedActivity()` creaba el usuario administrador por defecto sin
  `passwordHash`, violando el `CHECK password_required_unless_invited`
  (corregido reusando `seedUser()` en vez de `prisma.user.create` a mano);
  y `activities-crud.contract.spec.ts` usaba `prismaTestClient` sin
  importarlo.

- Jest: 234/234 (185 de `001`+`002` + 49 nuevas de `activities`: contrato
  31, integración 10, unitarias 8).
- Playwright: 14/14 (11 previos + 3 nuevas de `activities`).
- `docker compose ps`: `postgres`/`redis`/`mailpit` `healthy`.
- `003` sigue con Implementación ⏳ pendiente en "Estado por feature" hasta
  que `003-b`/`003-c`/`003-d` también cierren.
- Commits: `1095ff4` (docs: clarify T001-T005 + ADR-008, sesión anterior),
  `bce9029` (esquema + migración), `a81e9df` (`LedgerService`), `f73a48a`
  (módulo `activities`), `185aad2` (pruebas).

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
