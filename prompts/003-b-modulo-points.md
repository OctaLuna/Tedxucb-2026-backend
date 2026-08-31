# 003-b — Módulo `points`

## Contexto

Segundo módulo de `003-motor-de-puntos`, y el núcleo del proyecto entero: el
ledger de solo inserción del que depende quién ocupa las butacas del
auditorio. Requiere `003-a-modulo-activities.md` ya ejecutado (reutiliza
`ActivityStaffGuard`, la tabla `attendances`, y el Grupo 0 de clarify ya
debería estar resuelto — en particular T005/RF-337, que desbloquea T072 en
este módulo).

## Skill a cargar

`.claude/skills/motor-de-puntos/SKILL.md` (léela entera, incluida
`references/invariantes.md` — este módulo es exactamente lo que esa skill
describe), `.claude/skills/modulo-backend/SKILL.md`,
`.claude/skills/contratos-api/SKILL.md`, `.claude/skills/pruebas/SKILL.md`.

## Paso 1 — Migraciones (Grupo 2, parte de `points`)

T033 (`point_transactions`, el ledger — `UNIQUE` en `idempotency_key` y en
`reverses_id`, `CHECK non_zero`, `CHECK reversal_has_target`, `CHECK
manual_types_need_reason`), T034 (**trigger que prohíbe `UPDATE`/`DELETE`
sobre el ledger** y revocación de privilegios del rol de aplicación —
Artículo IV, "El ledger de puntos es de solo inserción: prohibido `UPDATE` y
`DELETE`" no es una convención de código, es una garantía de base de datos),
T035 (`point_claims` con índice único parcial `one_open_claim_per_activity`),
T036 (`total_points` en `student_profiles`, `CHECK total_points >= 0`,
índice descendente para el ranking que usará `003-c`).

## Paso 2 — Pruebas de contrato primero (Grupo 1, parte de `points`)

T014 (`GET /me/points` con reversión visible en el historial), T015
(ajustes: motivo obligatorio, cero puntos rechazado, penalización que excede
el saldo trunca a cero), T016 (reversión: éxito, doble reversión rechazada,
reversión de reversión rechazada), T017 (reclamos: alta, duplicado abierto
rechazado, aprobación, rechazo). Confirma que fallan antes de implementar
(Artículo III).

T037: prueba de integración de las restricciones de BD — movimiento sin
motivo rechazado por `CHECK`, intento de `UPDATE` sobre el ledger rechazado
por el trigger de T034. Esta prueba es la que realmente valida el Artículo
IV; sin ella, el trigger podría "funcionar en el código" y no en la base de
datos.

## Paso 3 — Implementación (Grupo 3 + parte del Grupo 6)

- **T040-T047**: servicio de ledger (`registrar movimiento` con clave de
  idempotencia, en transacción, con bloqueo de fila — `SELECT ... FOR
  UPDATE`, no verificación-luego-escritura), truncamiento a cero de
  penalizaciones, servicio de reversión (valida que el original no esté ya
  revertido), servicio de ajustes (motivo obligatorio), historial paginado
  con reversiones visibles, servicio de reconciliación (compara caché contra
  `SUM(point_transactions.points)`), **comando de consola `points-cli
  reconcile`** con salida JSON y flags `--student`, `--all`, `--fix`
  (Artículo II — corolario explícito de la constitución: debe poder
  ejecutarlo un operador en producción sin depender de la web), endpoints de
  ajuste y reversión con guard de administrador.
- **T070-T072**: servicio de reclamos (alta/listado/resolución), aprobación
  de reclamo (crea asistencia método `CLAIM` y otorga puntos en la **misma
  transacción** — no dos pasos separados), cierre de reclamos por
  vencimiento de plazo (T072, ya desbloqueada si `003-a` resolvió T005/
  RF-337; si no se resolvió todavía, detente aquí y resuélvela antes de
  seguir — no la saltees en silencio).

## Paso 4 — Observabilidad (parte del Grupo 8)

T091 (auditoría de toda acción sensible: ajustes, reversiones, cambios de
valor de actividad, cancelaciones — Artículo V), T092 (reconciliación
programada diaria vía BullMQ, con alerta si detecta desviación).

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Jest: contrato (T014-T017), integración de restricciones (T037), y las
   tres pruebas que la skill `pruebas` marca como no negociables para este
   módulo: **idempotencia** (reintentar el mismo movimiento con la misma
   clave no duplica puntos) y **trazabilidad de la reversión** (ambos
   movimientos, original y reversión, visibles y enlazados en el historial).
2. Playwright: `tests/e2e/points.e2e.spec.ts` — flujo de ajuste manual →
   consulta de historial → reversión → historial vuelve a reflejar el saldo
   correcto; y flujo de reclamo aprobado → puntos otorgados. Corrige
   cualquier fallo antes de cerrar.
3. Verifica manualmente `points-cli reconcile --all --json` contra datos de
   prueba con la caché alterada a mano — debe detectarlo; con `--fix`, debe
   corregirlo y dejar constancia en auditoría (esto es, en esencia, el
   escenario 12 de `specs/003-motor-de-puntos/quickstart.md`).
4. Actualiza `docs/progress.md`: fila `003-b` → ✅ hecho.
5. Commit(s), ejemplo:
   ```
   feat(points): T033-T036 migraciones del ledger con trigger de solo inserción
   test(points): T014-T017 T037 pruebas de contrato e integridad del ledger
   feat(points): T040-T047 servicio de ledger, reversión, ajustes y points-cli reconcile
   feat(points): T070-T072 reclamos con aprobación transaccional
   feat(points): T091-T092 auditoría y reconciliación programada
   ```
