# 004-a — Clarify, Plan y Tasks de Selección de cupos

## Contexto

`specs/004-seleccion-de-cupos/spec.md` depende de `003-motor-de-puntos`
completo (necesita el ranking de `leaderboard` para ejecutar el corte) — no
ejecutes este prompt hasta que `003-d-integracion-y-pulido.md` esté cerrado.
Es la feature con más marcadores abiertos (9 en el cuerpo del documento; el
checklist declara 10 — verifica ese desfase igual que en `001`) y la más
delicada del proyecto después del check-in: "cada ejecución es difícil de
revertir en términos humanos: una vez que se envió el correo de invitación,
no se puede deshacer", cita el propio spec.

Igual que en `001-a` y `002-a`: no escribas código todavía. El objetivo es
dejar `004` con `plan.md` + `data-model.md` + `contracts/` + `tasks.md`
completos.

## Skill a cargar

`.claude/skills/spec-workflow/SKILL.md`.

## Paso 1 — Clarify

9 marcadores abiertos en `specs/004-seleccion-de-cupos/spec.md` (verifica que
sigan ahí). Van en dos rondas de máximo 5 — la primera prioriza las que
afectan el modelo de datos y el algoritmo de corte, la segunda las
operativas:

**Ronda 1 — algoritmo y datos:**
1. Historia 2, escenario 5: ¿se permite cancelar una confirmación ya hecha?
   ¿Hasta cuándo? (liberar tarde un cupo puede dejarlo vacío).
2. Caso límite "alumno gana puntos después del corte": ¿el ranking queda
   congelado del todo, o los puntos posteriores reordenan la lista de
   espera? — **esta es probablemente la decisión más importante de toda la
   feature**, pregúntala primero.
3. RF-405: ¿de cuántos alumnos es la lista de espera? Debe cubrir la tasa
   esperada de no confirmación.
4. RF-411: ¿cuántas horas de plazo de confirmación? (se propuso entre 48 y
   72, sin confirmar).
5. RF-420: los 20 cupos no estudiantiles, ¿son íntegramente asignación
   manual del administrador, o alguna parte también se disputa por puntos?

**Ronda 2 — operativas:**
6. Historia 3, escenario 2: ¿el plazo de confirmación de un alumno promovido
   desde lista de espera es el mismo que el original, o más corto cerca del
   evento?
7. Historia 3, escenario 4: ¿cuántos días antes del evento se congela la
   promoción automática?
8. Caso límite "fallo de conectividad en la puerta": ¿se prevé una lista
   impresa de respaldo? (relacionado con `docs/operacion-dia-del-evento.md`,
   que ya tiene un marcador abierto sobre contactos de guardia — revísalo de
   paso).
9. RF-423: ¿se notifica también a quienes no entraron ni siquiera en lista
   de espera? Es una decisión de comunicación institucional, no solo
   técnica — probablemente conviene escalarla a quien organiza el evento,
   no decidirla solo dentro de esta sesión.

Sigue el mismo procedimiento de `001-a-clarify-plan-tasks.md` para cada
marcador resuelto (reemplazar, fechar, `specs/README.md`, ADR si es
estructural — el punto 2 de la Ronda 1 casi seguro lo es: define si el corte
es una fotografía inmutable o no).

## Paso 2 — Plan

Gates de Fase -1 contra `memory/constitution.md`. Especial atención al
Artículo III ("sin excepción... para el flujo de check-in y para la
asignación de cupos") — la ejecución del corte necesita el mismo tratamiento
test-first estricto que tuvo el check-in en `003`. RF-408 (la asignación no
puede ejecutarse dos veces sin reversión explícita auditada) es, en espíritu,
el mismo problema que el Artículo IV resuelve para el ledger de puntos:
tómalo como referencia de diseño.

Hipótesis de módulos a validar (máximo 3): algo como `allocation` (corte,
fotografía del ranking, lista de espera, promoción automática) y
`access-control` (entradas de un solo uso, verificación en puerta, aforo en
tiempo real). Podría ser uno solo si el gate de simplicidad lo prefiere.

Escribe `plan.md`, `data-model.md` (Cupo con su máquina de estados —
seleccionado → invitado → confirmado/rechazado/vencido/lista de espera →
ingresado —, Fotografía del corte, Entrada) y `contracts/`.

## Paso 3 — Tasks

`tasks.md` con el mismo formato y orden que `specs/003-motor-de-puntos/tasks.md`.
La ejecución del corte (RF-402 a RF-409) debería tener su propio grupo de
pruebas de contrato antes que cualquier código, exactamente igual que tuvo el
check-in en el Grupo 1 de `003`.

## Cierre

1. Actualiza `docs/progress.md`: fila `004-a` → ✅ hecho; `004` con Plan ✅ y
   Tasks ✅; entrada en la Bitácora, incluyendo qué se decidió sobre el punto
   2 de la Ronda 1 (es la decisión que más va a afectar `004-b`).
2. Commit, ejemplo:
   ```
   docs(cupos): resuelve marcadores de clarify y agrega plan/tasks de 004
   ```
