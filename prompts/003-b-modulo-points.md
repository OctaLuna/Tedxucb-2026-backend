# 003-b — Módulo `points`

## Contexto

Segundo módulo de `003-motor-de-puntos`, y el núcleo del proyecto entero: el
ledger de solo inserción del que depende quién ocupa las butacas del
auditorio. Requiere `003-a-modulo-activities.md` ya ejecutado (reutiliza
`ActivityStaffGuard`, la tabla `attendances`, el Grupo 0 de clarify — resuelto
2026-09-02 — y, sobre todo, **`LedgerService`, `point_transactions`, el
trigger de inmutabilidad y `student_profiles.total_points`, que `003-a` ya
creó** porque el check-in los necesita para existir. `003-b` no repite esas
migraciones: solo reutiliza `LedgerService` (`src/common/ledger/`) para
ajustes/bonos/penalizaciones/reversiones administrativas.

**Cambio de alcance (2026-09-02, ver ADR-008):** se eliminó todo el canal de
reclamos (Historia 5 del spec) y el concepto de fecha de corte del ranking.
Este módulo ya no incluye ningún trabajo de reclamos.

## Skill a cargar

`.claude/skills/motor-de-puntos/SKILL.md` (léela entera, incluida
`references/invariantes.md` — este módulo es exactamente lo que esa skill
describe), `.claude/skills/modulo-backend/SKILL.md`,
`.claude/skills/contratos-api/SKILL.md`, `.claude/skills/pruebas/SKILL.md`.

## Paso 1 — Verificar las migraciones que `003-a` ya aplicó (no repetirlas)

T033 (`point_transactions`), T034 (trigger que prohíbe `UPDATE`/`DELETE`
sobre el ledger) y T036 (`total_points` en `student_profiles`) **ya existen**
— `003-a` las ejecutó porque el check-in no puede funcionar sin ellas
(Registro de complejidad de `plan.md`, entrada 2026-09-02). Confirma con
`npx prisma migrate status` y una inspección rápida del schema que están
aplicadas antes de seguir; no vuelvas a crear estas migraciones.

**T035 (`point_claims`) no aplica: se eliminó junto con el canal de reclamos
(ADR-008).**

## Paso 2 — Pruebas de contrato primero (Grupo 1, parte de `points`)

T014 (`GET /me/points` con reversión visible en el historial), T015
(ajustes: motivo obligatorio, cero puntos rechazado, penalización que excede
el saldo trunca a cero), T016 (reversión: éxito, doble reversión rechazada,
reversión de reversión rechazada). **T017 (reclamos) no aplica, eliminada.**
Confirma que fallan antes de implementar (Artículo III).

T037 (parte restante — `003-a` ya cubrió el doble check-in por índice y el
`UPDATE` sobre el ledger rechazado por el trigger, en su propia
`activities-db-constraints.integration.spec.ts`): prueba de integración de
`manual_types_need_reason` para los tipos que crea *este* módulo (`BONUS`,
`PENALTY`, `ADJUSTMENT`, `REVERSAL` sin motivo → rechazado por `CHECK`). No
dupliques las pruebas de `003-a`.

## Paso 3 — Implementación (Grupo 3)

- **T040-T047**: **reutiliza `LedgerService` de `src/common/ledger/`**
  (`003-a` ya construyó `recordMovement`/`reverseMovement` con clave de
  idempotencia, transacción y bloqueo de fila — `SELECT ... FOR UPDATE` — no
  lo reimplementes) para construir sobre él: truncamiento a cero de
  penalizaciones (ya lo hace `recordMovement`, confírmalo con una prueba
  propia de este módulo), servicio de reversión administrativa (valida que
  el original no esté ya revertido, traduce la violación de `reverses_id`
  única a `409 ALREADY_REVERSED`), servicio de ajustes (motivo obligatorio),
  historial paginado con reversiones visibles, servicio de reconciliación
  (compara caché contra `SUM(point_transactions.points)`), **comando de
  consola `points-cli reconcile`** con salida JSON y flags `--student`,
  `--all`, `--fix` (Artículo II — corolario explícito de la constitución:
  debe poder ejecutarlo un operador en producción sin depender de la web),
  endpoints de ajuste y reversión con guard de administrador.

**Grupo de reclamos (antes T070-T072): eliminado, ver ADR-008.**

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
   correcto. Corrige cualquier fallo antes de cerrar.
3. Verifica manualmente `points-cli reconcile --all --json` contra datos de
   prueba con la caché alterada a mano — debe detectarlo; con `--fix`, debe
   corregirlo y dejar constancia en auditoría (esto es, en esencia, el
   escenario 11 de `specs/003-motor-de-puntos/quickstart.md`, renumerado
   2026-09-02).
4. Actualiza `docs/progress.md`: fila `003-b` → ✅ hecho.
5. Commit(s), ejemplo:
   ```
   test(points): T014-T016 T037 pruebas de contrato e integridad del ledger
   feat(points): T040-T047 ajustes, reversión administrativa y points-cli reconcile
   feat(points): T091-T092 auditoría y reconciliación programada
   ```
