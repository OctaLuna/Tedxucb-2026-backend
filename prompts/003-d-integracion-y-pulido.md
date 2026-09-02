# 003-d — Integración cruzada y pulido de Motor de puntos

## Contexto

Cierra la feature `003-motor-de-puntos`. Requiere los tres módulos anteriores
(`003-a` activities, `003-b` points, `003-c` leaderboard) ya implementados:
las pruebas de este prompt son precisamente las que ejercitan los tres juntos
— no tiene sentido escribirlas antes. Corresponde al Grupo 7 completo de
`tasks.md` (integración) más el Grupo 9 (pulido) que no cerraron ya los
prompts anteriores.

## Skill a cargar

`.claude/skills/pruebas/SKILL.md`, `.claude/skills/motor-de-puntos/SKILL.md`.

## Paso 1 — Integración end-to-end (Grupo 7)

Cada una contra PostgreSQL real, siguiendo el flujo completo declarado en el
Artículo IX de `memory/constitution.md` ("crear actividad, escanear, otorgar
puntos, revertir, asignar cupo, confirmar, ingresar" — la parte de cupos
llega con `004`, aquí cubre hasta revertir):

- **T080** — ciclo completo de la Historia 1 del spec, de punta a punta.
- **T081** — concurrencia: dos check-ins simultáneos del mismo alumno con
  `Promise.all`, exactamente uno prospera (si ya la escribiste en `003-a`
  como parte del cierre de ese módulo, verifica que siga pasando aquí junto
  al resto, no la dupliques).
- **T082** — idempotencia: reintento tras fallo de red simulado no duplica
  puntos.
- **T083** — reversión y trazabilidad completa en el historial.
- **T084** — cambiar el valor de puntos de una actividad no recalcula lo ya
  otorgado (los movimientos ya emitidos conservan el valor vigente al
  momento del abono).
- **T085 no aplica — eliminada 2026-09-02** (reclamos, ver ADR-008).
- **T086** — reconciliación detecta y corrige una caché alterada a mano
  (`points-cli reconcile --all --fix --json`).

## Paso 2 — Pulido restante (Grupo 9)

- **T101** — documentación OpenAPI generada y verificada contra
  `specs/003-motor-de-puntos/contracts/*.md` (deben decir lo mismo; si
  divergen, el contrato manda — actualiza el código o el contrato,
  explícitamente, no dejes que se desincronicen en silencio).
- **T102** — actualiza `specs/003-motor-de-puntos/quickstart.md` con los
  pasos reales tras la implementación (los 14 escenarios deben poder
  ejecutarse tal cual están descritos, con comandos/URLs reales donde el
  documento original dejaba el paso en abstracto).
- **T103** — **no es una tarea que un agente pueda cerrar**: es el escenario
  13 del quickstart (renumerado 2026-09-02, antes 14 — se eliminó el
  escenario de reclamos), una prueba de campo física (20 alumnos simulados, 2
  staff, teléfonos de gama media, red de campus real) que debe ejecutarse
  antes de la primera actividad real del evento. Déjala anotada en
  `docs/progress.md` como pendiente **operativo**, no de código — no la
  marques como hecha ni intentes automatizarla.

## Pruebas y cierre

1. Jest: las 6 pruebas de integración (T080-T084, T086 — T085 eliminada,
   ADR-008), todas contra PostgreSQL real.
2. Playwright: si algún flujo cruzado entre `003-a/b/c` (p. ej. un ajuste
   administrativo → aparece en `/me/points` → afecta `/leaderboard`) no está
   ya cubierto por sus E2E individuales, añade
   `tests/e2e/points-integration.e2e.spec.ts` con ese caso. No dupliques
   specs que ya existen.
3. Actualiza `docs/progress.md`: fila `003-d` → ✅ hecho; marca `003` con
   Implementación ✅ en "Estado por feature" (los tres módulos + esta
   integración ya están cerrados); dejar constancia explícita de que T103
   (prueba de campo) sigue pendiente y por qué no cuenta como bloqueante del
   resto del proyecto.
4. Commit(s), ejemplo:
   ```
   test(points): T080-T086 integración end-to-end del motor de puntos
   docs(points): T101-T102 OpenAPI y quickstart actualizados contra contracts/
   ```
