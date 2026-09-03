# 004-b — Implementación de Selección de cupos

## Contexto

Última pieza del backend. Requiere `004-a-clarify-plan-tasks.md` ejecutado
(para `tasks.md` con IDs reales) y `003-d-integracion-y-pulido.md` cerrado
(necesita el ranking real de `leaderboard` para el corte, no un mock).

> **Corregido 2026-09-03:** este prompt se escribió antes de ADR-009 y
> originalmente instruía construir invitación con plazo de confirmación,
> lista de espera y promoción automática (RF-413 a RF-415). Ese diseño se
> eliminó — ver `docs/decisiones/README.md`. Sigue `tasks.md` de `004-a`
> (ya corregido, la fuente de verdad actual) como referencia de tareas,
> no listas de RF de una versión anterior de `spec.md`.

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/motor-de-puntos/SKILL.md`
(el corte lee el mismo ranking que expone `leaderboard` — sus invariantes de
auditabilidad e idempotencia aplican igual aquí), `.claude/skills/seguridad-y-roles/SKILL.md`
(el control de acceso en puerta es, en esencia, otro guard de privilegio
mínimo).

## Qué hacer

1. Confirma el/los módulo(s) que definió `specs/004-seleccion-de-cupos/plan.md`.
   Si son varios, divide igual que en `001-b` (crea `004-c-...` por módulo
   adicional).
2. Sigue `tasks.md` de 004 en orden contratos → pruebas → modelo →
   implementación → integración → pulido. Artículo III: sin excepción de
   test-first para la asignación de cupos, igual que para el check-in.
3. Presta atención particular a:
   - RF-402/408: la ejecución de la selección es una acción explícita del
     administrador, nunca automática, y no puede repetirse sin reversión
     auditada — diséñala con el mismo cuidado que el ledger de puntos
     (Artículo IV). **Resuelto en ADR-009:** la selección es inmutable
     (sin lista de espera que reordenar); constrúyela en consecuencia.
   - RF-404: el puntaje y la posición de cada seleccionado deben
     persistirse en el momento de la selección — no puede ser un cálculo
     derivado que cambie si el ranking cambia después.
   - **RF-413 a RF-415 no aplican — eliminados (ADR-009):** sin
     confirmación del alumno no hay plazo que venza ni lista de espera que
     promover. Un lugar liberado solo se llena si el administrador decide
     hacerlo a mano (`POST /selection/manual`), nunca automático — no
     construyas ningún job de BullMQ para esto.
   - RF-417: entrada de un solo uso — mismo patrón de `UPDATE` condicionado
     que ya usó `002` en `applications.service.ts` (y `003-a` para evitar
     doble check-in), no reinventes el mecanismo. El código de la entrada
     se guarda **en claro**, no hasheado (corrección 2026-09-03,
     `data-model.md` §3): a diferencia de un token de sesión, el alumno
     necesita poder volver a verlo en cualquier momento vía
     `GET /me/entry`.
   - RF-422: toda ejecución, reversión y asignación manual queda en
     auditoría (Artículo V).

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Jest: contrato + integración + unitarias del módulo `selection`
   (`tasks.md` de `004-a` trae los IDs reales, T010-T065). Incluye
   explícitamente una prueba de que ejecutar la selección dos veces sin
   reversión explícita falla (RF-408, T061), y una de concurrencia real
   para el escaneo de entrada en puerta (dos intentos simultáneos de la
   misma entrada vía `Promise.all`, exactamente uno prospera — mismo
   patrón que `checkin-concurrency.integration.spec.ts` de `003-a`; no
   está enumerada aparte en `tasks.md`, agrégala igual).
2. Playwright: `tests/e2e/selection.e2e.spec.ts` cubriendo al menos:
   ejecutar la selección → el alumno seleccionado consulta
   `GET /me/entry` → su entrada se valida en la puerta una vez → un
   segundo intento de la misma entrada es rechazado. **Sin paso de
   confirmación** (no existe, ADR-009).
   Corrige cualquier fallo antes de cerrar.
3. Actualiza `docs/progress.md`: marca `004` con Implementación ✅ en
   "Estado por feature" — esto cierra el backend completo de las 4
   features.
4. Commit(s), ejemplo:
   ```
   feat(selection): T040-T047 ejecución, reversión y asignación manual
   feat(selection): T050-T055 entradas de un solo uso y aforo en tiempo real
   test(selection): pruebas de contrato, integración y E2E del flujo completo
   ```
