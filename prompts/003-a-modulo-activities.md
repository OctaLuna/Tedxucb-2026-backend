# 003-a — Módulo `activities`

## Contexto

Primer módulo de negocio de `003-motor-de-puntos` (requiere
`00-bootstrap-infraestructura.md` y, al menos, la parte de roles/guards de
`001-b` ejecutados — el guard de staff necesita que existan usuarios y
roles). Cubre actividades, asignación de staff, tokens QR y el flujo completo
de check-in: es el módulo más grande de la feature porque el check-in es la
operación más crítica del proyecto entero (`CLAUDE.md`: "cada punto mal
otorgado... es una decisión injusta con nombre y apellido").

`points` y `leaderboard` (prompts `003-b` y `003-c`) dependen de que este
módulo exista: `points` reutiliza `ActivityStaffGuard` y las tablas
`activities`/`attendances`.

## Skills a cargar

`.claude/skills/motor-de-puntos/SKILL.md` (obligatoria, no opcional),
`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/seguridad-y-roles/SKILL.md`
(el guard de staff es privilegio mínimo por asignación explícita, Art. V).

## Paso 0 — Resolver el Grupo 0 de `tasks.md` (clarify puntual de 003)

Antes de tocar código, `specs/003-motor-de-puntos/tasks.md` tiene 5 tareas de
desbloqueo sin resolver (T000/RF-310 ya se resolvió, no hace falta tocarla).
Pregúntaselas al usuario — es exactamente el máximo de 5 por ronda que
permite la skill `spec-workflow`:

- **T001** — RF-342: ¿el ranking es visible para los propios alumnos, o solo
  para administrador/staff? (bloquea el alcance completo de `003-c`).
- **T002** — RF-322: ¿qué umbral de check-ins por dispositivo se considera
  anómalo? (bloquea T090 de este mismo módulo).
- **T003** — RF-323: ¿existen actividades masivas que necesiten un modo de
  registro distinto al escaneo uno a uno?
- **T004** — caso límite de cupo lleno de una actividad + vigencia del token
  QR en ese momento.
- **T005** — RF-337: plazo de cierre de reclamos antes del corte de cupos
  (bloquea T072 de `003-b`).

Resuélvelas siguiendo el mismo procedimiento de `001-a-clarify-plan-tasks.md`
(marcador → decisión fechada → `specs/README.md` → ADR si aplica → marca
T001-T005 como resueltas en `tasks.md`). Esto desbloquea T090 aquí mismo y
T072 en `003-b`.

## Paso 1 — Migraciones (Grupo 2 de `tasks.md`, parte de `activities`)

T030 (`activity_categories` + `activities`), T031 (`activity_staff`), T032
(`attendances`, con el índice único parcial `one_attendance_per_activity`
sobre `(activity_id, student_id) WHERE status <> 'REJECTED'` — RF-315), T038
(semillas de categorías con valor sugerido, RF-310a — **verifica primero**
si `data-model.md` sigue diciendo "bloqueado por RF-310": según `tasks.md`
esa RF ya se resolvió el 2026-08-30, hay una posible desincronización entre
ambos documentos que vale la pena corregir de paso).

## Paso 2 — Pruebas de contrato primero (Grupo 1, parte de `activities`)

T010 (ciclo feliz de check-in), T011 (los 6 modos de fallo documentados en
`contracts/checkin.md`, más el 7º derivado de `001` — ver T068 abajo), T012
(check-in manual con y sin justificación), T013 (`GET /me/qr` y rechazo de
token vencido). Escríbelas antes que el código y **confirma que fallan**
(Artículo III) antes de seguir.

## Paso 3 — Implementación (Grupos 4 y 5)

- **T050-T057**: emisión y verificación de token QR firmado de vida corta,
  `GET /me/qr`, CRUD de actividades con máquina de estados (borrador,
  publicada, cerrada, cancelada), asignación/retiro de staff,
  `ActivityStaffGuard` (verifica asignación explícita, no solo el rol —
  Art. V), protección contra eliminar actividades con asistencias (ofrece
  cancelación en su lugar), reversión en bloque al cancelar con confirmación
  del administrador.
- **T060-T068**: servicio de check-in transaccional de siete pasos (validar
  token → verificar asignación de staff → verificar ventana → `INSERT`
  asistencia → `INSERT` movimiento de puntos → `UPDATE` caché → responder),
  manejo de conflicto de idempotencia (`200` con el resultado previo, nunca
  error), manejo de duplicado (`409` con hora y validador del registro
  previo), validación de ventana/estado de la actividad, endpoint con
  respuesta enriquecida (nombre, foto, código, puntos, nuevo total),
  check-in manual con justificación obligatoria, registro de `device_hash` e
  `ip_address`, encolado de notificación **después** de confirmar la
  transacción (nunca antes — si la transacción falla no debe salir
  notificación). **T068**: rechaza el check-in de alumnos con cuenta
  pendiente de verificación (RF-122, requiere que `001-b` ya exista) — esto
  es un 7º modo de fallo que no está en `contracts/checkin.md` todavía;
  añádelo ahí al implementarlo.
- **T090**: detección de anomalías por dispositivo, ahora desbloqueada por
  el umbral que resolviste en el Paso 0 (T002).

## Paso 4 — Pulido de este módulo (parte del Grupo 9)

T100 (límite de frecuencia diferenciado para el endpoint de check-in), T104
(prueba de carga con escaneo simultáneo — usa la prueba de concurrencia del
Paso de cierre como base).

## Pruebas y cierre

Cierre estándar de `prompts/README.md`. Puntos no negociables por ser
check-in (Artículo III lo dice explícitamente: "sin excepción"):

1. Jest: contrato (T010-T013), integración de restricciones de BD (parte de
   T037: doble check-in rechazado por el índice único, no por lógica de
   aplicación), y **concurrencia real** (dos escaneos simultáneos del mismo
   alumno con `Promise.all`, exactamente uno prospera).
2. Playwright: `tests/e2e/activities.e2e.spec.ts` — al menos el ciclo feliz
   de check-in de punta a punta vía HTTP, el rechazo por token vencido, y el
   rechazo por staff no asignado. Corrige cualquier fallo antes de cerrar.
3. Actualiza `docs/progress.md`: fila `003-a` → ✅ hecho, con el resultado de
   Jest y Playwright.
4. Commit(s), ejemplo:
   ```
   feat(activities): T030-T032 T038 migraciones de actividades y asistencias
   test(activities): T010-T013 pruebas de contrato de check-in (Red)
   feat(activities): T050-T057 tokens QR, CRUD de actividades y guard de staff
   feat(activities): T060-T068 check-in transaccional con idempotencia
   docs(activities): T001-T005 resuelve Grupo 0 de clarify de 003
   ```
