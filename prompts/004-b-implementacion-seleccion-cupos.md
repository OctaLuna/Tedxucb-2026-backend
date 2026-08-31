# 004-b — Implementación de Selección de cupos

## Contexto

Última pieza del backend. Requiere `004-a-clarify-plan-tasks.md` ejecutado
(para `tasks.md` con IDs reales) y `003-d-integracion-y-pulido.md` cerrado
(necesita el ranking real de `leaderboard` para el corte, no un mock).

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
   - RF-402/408: la ejecución del corte es una acción explícita del
     administrador, nunca automática, y no puede repetirse sin reversión
     auditada — diséñala con el mismo cuidado que el ledger de puntos
     (Artículo IV): registra qué se decidió en el Paso 2 de `004-a` sobre si
     el corte es inmutable, y constrúyela en consecuencia.
   - RF-404: la "fotografía" del corte (puntaje y posición congelados) debe
     persistirse — no puede ser un cálculo derivado que cambie si el ranking
     cambia después.
   - RF-413/414/415: liberación automática por vencimiento y promoción
     automática de lista de espera — usa BullMQ (ya configurado en
     `00-bootstrap-infraestructura.md`) para los jobs programados, siguiendo
     el mismo patrón que la reconciliación diaria de `003-b`.
   - RF-417: entrada de un solo uso — mismo patrón de índice único +
     verificación atómica que ya usó `003-a` para evitar doble check-in, no
     reinventes el mecanismo.
   - RF-422: toda ejecución, reversión, promoción y asignación manual queda
     en auditoría (Artículo V).

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Jest: contrato + integración + unitarias del/los módulo(s). Incluye
   explícitamente una prueba de que ejecutar el corte dos veces sin
   reversión explícita falla (RF-408), y una de concurrencia para el
   escaneo de entrada en puerta (dos intentos simultáneos de la misma
   entrada, exactamente uno prospera — mismo patrón que el check-in).
2. Playwright: `tests/e2e/allocation.e2e.spec.ts` (o el nombre del módulo que
   resulte) cubriendo al menos: ejecutar el corte → alumno seleccionado
   recibe invitación → confirma → recibe entrada → entrada se valida en
   puerta una vez → segundo intento de la misma entrada es rechazado.
   Corrige cualquier fallo antes de cerrar.
3. Actualiza `docs/progress.md`: marca `004` con Implementación ✅ en
   "Estado por feature" cuando todos sus módulos estén hechos — esto cierra
   el backend completo de las 4 features.
4. Commit(s), ejemplo:
   ```
   feat(allocation): RF-402-409 ejecución del corte con fotografía inmutable
   feat(allocation): RF-413-415 vencimiento y promoción automática vía BullMQ
   feat(access-control): RF-416-419 entradas de un solo uso y aforo en tiempo real
   test(allocation): pruebas de contrato, integración y E2E del flujo de cupos
   ```
