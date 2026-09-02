# ADR-008 — Sin canal de reclamos ni fecha de corte del ranking

**Fecha:** 2026-09-02 · **Estado:** aceptada

## Contexto

`spec.md` de `003` diseñaba una Historia 5 completa ("El alumno reclama un
punto faltante"): una entidad `PointClaim`, tres endpoints
(`POST/GET /claims`, `PATCH /claims/:id`) y un plazo de cierre antes de una
fecha de corte del ranking (RF-337). Al resolver el Grupo 0 de `tasks.md`
(T005), el responsable del proyecto respondió, textual: "no necesitamos una
sección de reclamos, no es necesario, tampoco tendremos un evento de cierre
del ranking, que continúe siempre".

Son dos decisiones distintas empaquetadas en una respuesta:

1. No existe un canal formal para que un alumno reporte puntos faltantes.
2. El ranking no tiene un evento de "cierre": es una vista continua, siempre
   vigente, sin una fecha del sistema que lo congele.

## Decisión

Se elimina la Historia 5 completa del spec, la entidad `PointClaim` del
modelo de datos, los tres endpoints de reclamos del contrato, y el campo
`pointsToCutoff` de `GET /me/progress`. `attendances.method` pierde el valor
`'CLAIM'` del `CHECK valid_method` — ningún flujo restante lo produce
(Artículo VII, no dejar código muerto en una restricción del motor).

Un alumno que crea que le falta un punto lo reporta por un canal informal
(correo, WhatsApp, presencial, exactamente el escenario que la propia
Historia 5 original describía como alternativa indeseable — "por WhatsApp,
por pasillo, por insistencia"). El administrador lo resuelve con un
movimiento `ADJUSTMENT` o `BONUS` manual con motivo obligatorio (RF-330), que
queda auditado y visible en el historial del alumno como cualquier otro
movimiento del ledger. El Artículo IV (auditabilidad del puntaje) ya
garantiza que esa corrección quede tan trazable como lo habría estado un
reclamo formal — lo que se pierde no es trazabilidad, es el flujo
autoservicio para que el alumno lo inicie sin intervención humana directa.

## Alternativas

**Mantener el canal formal como estaba especificado.** Descartada porque el
responsable del proyecto la rechazó explícitamente, con el evento a semanas
de distancia y el Artículo VII exigiendo no construir lo que no está
confirmado. Construirlo igual habría sido exactamente el anti-patrón que la
constitución prohíbe.

**Mantener un canal informal pero documentado dentro del sistema** (por
ejemplo, un campo de texto libre en el perfil del alumno, sin máquina de
estados). Descartada: agrega una entidad y una superficie de UI nuevas para
un caso que el propio responsable calificó como innecesario; si el volumen
real de "alumnos que insisten que les falta un punto" resulta alto durante la
operación del evento, se reabre con datos reales en vez de anticiparlo ahora.

## Consecuencias

- Menos alcance: sin entidad `PointClaim`, sin máquina de estados de tres
  valores, sin índice de reclamo abierto único, sin cuatro tareas de
  implementación (T017, T035, T070–T072, T085) ni el escenario de reclamo de
  `quickstart.md`. Tiempo recuperado para el resto de una feature ya
  calificada como la de mayor riesgo del proyecto.
- **Costo:** no hay SLA ni auditoría específica de "reclamos resueltos"; la
  resolución de una omisión real depende enteramente de la disciplina
  administrativa y de un canal que el sistema no modela ni mide. `CE-305` (que
  medía justamente esto) se elimina sin reemplazo — no hay ninguna métrica que
  indique si este canal informal está funcionando.
- **Costo:** sin fecha de corte, la responsabilidad de decidir "cuándo se
  toma la fotografía del ranking para seleccionar cupos" recae enteramente en
  `004`, que ya la modelaba como una acción operativa propia (RF-403, "el
  corte" de `004`) — no hay cambio de código en `004`, pero si algún alumno
  gana puntos después del corte de `004` y antes del evento, el ranking de
  `003` seguirá reflejándolo aunque su cupo ya haya sido decidido con el
  puntaje anterior. Ese caso límite ya existe en `004` y esta decisión no lo
  resuelve ni lo agrava: sigue siendo responsabilidad exclusiva de `004`.

## Requisitos

RF-334 a RF-337 (eliminados). RF-342 (visibilidad del ranking, resuelto en la
misma ronda pero sin relación estructural con esta decisión). `pointsToCutoff`
de `contracts/points-and-leaderboard.md` (antes `points-and-claims.md`).
