# ADR-009 — Selección de asistentes sin confirmación ni lista de espera

**Fecha:** 2026-09-03 · **Estado:** aceptada

## Contexto

`spec.md` de `004-seleccion-de-cupos` (redactado antes de que existiera
código, junto con el resto de los specs iniciales del proyecto) diseñaba un
flujo elaborado para las 80 butacas estudiantiles: el alumno seleccionado
recibía una invitación con un plazo configurable (RF-411, 48-72 horas
propuestas) para confirmar o rechazar (RF-412); si no respondía a tiempo,
el lugar se liberaba automáticamente (RF-413) y el sistema promovía sin
intervención humana al primero de una lista de espera ordenada (RF-405,
RF-414), que además dejaba de promoverse sola cerca del evento (RF-415).
Historia 3 completa ("La lista de espera se mueve sola") existía para
describir ese mecanismo.

Al ejecutar el Paso 1 de `004-a-clarify-plan-tasks.md` y preguntar los 9
marcadores `[NECESITA CLARIFICACIÓN]` de ese diseño tal como estaban
planteados, la respuesta del responsable del proyecto fue, textual: "NO HAY
CUPOS, ELIMINA TODO EL CONTENIDO QUE HAYA SOBRE CUPOS" / "NO HAY LISTA DE
ESPERA". Una segunda ronda de preguntas, evitando esa terminología y
confirmando primero si el aforo limitado seguía siendo real, aclaró el
malentendido: el aforo de 80 alumnos por ranking sigue existiendo tal cual
(RF-401, RF-403, RF-407, sin cambios), pero **el mecanismo alrededor de la
selección era mucho más elaborado de lo que el responsable del proyecto
tenía en mente**. Su modelo, en sus propias palabras: el ranking define los
80, "se enviará a las personas que entrarán" (aviso a los seleccionados,
sin más paso), "se cerrará cuando diga el admin" (acción explícita del
administrador, RF-402 sin cambios), y para un lugar que se libera "el admin
puede invitar a alguien más a mano" — una decisión suya, no un algoritmo.

## Decisión

Se elimina de `spec.md`:

- El paso de confirmación/rechazo del alumno (Historia 2, escenarios 2 a
  5; RF-411, RF-412, RF-413). Estar entre los 80 mejores del ranking en el
  momento de la selección y recibir el aviso correspondiente ya dejan al
  alumno seleccionado — no hay una acción propia pendiente de su parte.
- La lista de espera y su promoción automática al completo (Historia 3
  entera; RF-405, RF-414, RF-415). El resultado de una selección es la
  lista final; no hay una segunda estructura ordenada detrás esperando su
  turno.
- La notificación a quienes no fueron seleccionados (RF-423 resuelto: no
  se les avisa nada). Cualquier alumno puede seguir consultando su propio
  puntaje y posición en su perfil — el sistema no le manda nada de forma
  proactiva.

Se mantiene, sin cambios de fondo:

- El aforo configurable y el ranking puro por puntos (RF-401, RF-403,
  RF-406, RF-407).
- La exclusión de alumnos deshabilitados (RF-409).
- Conservar el puntaje y la posición que tenía cada seleccionado en el
  momento de la selección (RF-404) — la confusión inicial fue con la
  palabra usada para explicarlo ("fotografía"), no con la necesidad de
  guardar ese dato para poder justificar la decisión después (CE-401).
- Que la selección sea una acción explícita del administrador, nunca
  automática (RF-402), y que no pueda ejecutarse dos veces sin una
  reversión explícita y auditada (RF-408) — sigue haciendo falta incluso
  en el modelo simplificado: sin esto, repetir la ejecución por error
  volvería a marcar y podría volver a notificar a la misma gente.
- Los ~20 lugares no estudiantiles, íntegramente de asignación manual del
  administrador (RF-420 resuelto en ese sentido), y el control de acceso
  del día del evento (Historia 4: entrada de un solo uso, escaneo en
  puerta, aforo en tiempo real) — confirmados explícitamente sin cambios.
- Un lugar que se libera después de la selección no tiene reemplazo
  automático: si el administrador decide llenarlo, es una acción manual
  suya (marcar a otro alumno o invitado como seleccionado), auditada como
  cualquier asignación manual — no un algoritmo de reposición.

## Alternativas

**Mantener el diseño original tal como estaba especificado.** Descartada:
el responsable del proyecto lo rechazó explícitamente y de forma enfática.
Mantenerlo habría sido exactamente lo que el Artículo VII prohíbe —
construir un mecanismo de invitación-con-plazo y reposición automática que
nadie pidió, para un evento que ocurre una sola vez.

**Mantener la confirmación pero eliminar solo la lista de espera** (o
viceversa). Descartada: las respuestas rechazaron ambas partes por igual, y
mezclar "sin lista de espera pero con plazo de confirmación que libera un
lugar sin nadie que lo tome automáticamente" no resuelve ningún problema
real — solo agrega un estado transitorio (invitado-pendiente-de-confirmar)
sin ninguna promoción que lo consuma.

**Automatizar el reemplazo cuando se libera un lugar** (p. ej., tomar
automáticamente al siguiente del ranking). Descartada: contradice
directamente "el admin puede invitar a alguien más a mano" — la
organización prefiere una decisión humana explícita para cada reemplazo,
no un automatismo silencioso sobre una lista que, en este modelo, ya no
existe como estructura ordenada y vigente.

## Consecuencias

- Modelo de datos mucho más simple: un alumno está seleccionado o no lo
  está; una entrada está usada o no. Sin máquina de estados de invitación
  (pendiente/confirmado/rechazado/vencido), sin entidad de lista de
  espera, sin job programado de "liberar y promover".
- Menos superficie de prueba y de código: no hace falta un plazo
  configurable, un job de vencimiento, ni la prueba de "promoción
  automática sin intervención humana" que describía Historia 3.
- **Costo:** sin promoción automática, un lugar liberado a último momento
  depende enteramente de que el administrador lo note y decida llenarlo a
  mano — no hay ninguna garantía de que el aforo estudiantil se ocupe al
  100% (CE-403 ya asumía esto con un umbral del 95%, no del 100%, así que
  no contradice el criterio existente, pero sí elimina el mecanismo que
  lo habría acercado más a ese número sin trabajo manual).
- **Costo:** sin notificación a los no seleccionados, un alumno que no
  entró se entera únicamente si consulta su propio perfil — no hay ningún
  aviso proactivo de "no quedaste esta vez". Coherente con lo que ya
  resolvió el responsable del proyecto para RF-423, documentado igual para
  que quede explícito y no se lea como un olvido.

## Requisitos

RF-405, RF-411 a RF-415 (eliminados). RF-410 (reescrito: solo notifica a
los seleccionados, sin mención de plazo). RF-420, RF-423 (resueltos en el
sentido descrito arriba). RF-401, RF-402, RF-403, RF-404, RF-406, RF-407,
RF-408, RF-409 (sin cambios, confirmados explícitamente). Historia 2
(reducida) e Historia 3 (eliminada) de `spec.md`.
