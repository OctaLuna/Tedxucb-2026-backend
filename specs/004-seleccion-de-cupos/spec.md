# Especificación: Selección y gestión de cupos

**Rama/ID:** `004-seleccion-de-cupos`
**Estado:** Borrador — pendiente de clarificación
**Entrada:** "a esa charla solamente pueden entrar 100 personas, unos 80 alumnos, ahora para escoger a los alumnos se tomará en cuenta por puntos"

## Contexto

Esta feature ejecuta la decisión que da sentido a todo el sistema: **quién
entra al TEDxUCB y quién no.** Se ejecuta pocas veces, cerca del evento, y cada
ejecución es difícil de revertir en términos humanos: una vez que se envió el
correo de invitación, no se puede deshacer.

Por eso el proceso es explícito y disparado por una persona, nunca un cálculo
en vivo. Y por eso cada decisión queda congelada: cuando alguien pregunte "¿por
qué él y yo no?", debe existir el número exacto que lo justifica, tal como
estaba en el momento del corte.

## Alcance

**Sí cubre:** corte del ranking, asignación de los cupos estudiantiles, lista de
espera, invitación y confirmación, promoción automática, entradas y control de
acceso el día del evento.

**No cubre:** acumulación de puntos (`003`), venta de entradas al público
general.

**Depende de:** `003-motor-de-puntos`.

---

## Historias de usuario

### Historia 1 — El administrador ejecuta la selección (Prioridad: P1)

Como **administrador**, quiero ejecutar la asignación de cupos en un momento
definido para determinar de forma justa y trazable qué alumnos asisten.

**Por qué esta prioridad:** es el propósito completo de esta feature.

**Prueba independiente:** con alumnos y puntajes cargados, se ejecuta la
asignación y el sistema produce la lista de seleccionados y la lista de espera.

**Escenarios de aceptación:**

1. **Dado** un ranking con más alumnos que cupos, **Cuando** el administrador
   ejecuta la asignación, **Entonces** el sistema selecciona a los primeros
   según el número de cupos estudiantiles y coloca al resto en lista de espera
   ordenada.
2. **Dado** la asignación ejecutada, **Cuando** se consulta a cualquier
   seleccionado, **Entonces** consta el puntaje y la posición que tenía en el
   momento exacto del corte.
3. **Dado** dos alumnos con idéntico puntaje en el límite del corte, **Cuando**
   se ejecuta la asignación, **Entonces** el criterio de desempate se aplica de
   forma determinista y el resultado es reproducible.
4. **Dado** una asignación ya ejecutada, **Cuando** el administrador intenta
   ejecutarla de nuevo, **Entonces** el sistema lo impide salvo que la revierta
   explícitamente, y la reversión queda auditada.
5. **Dado** alumnos deshabilitados en el padrón, **Cuando** se ejecuta la
   asignación, **Entonces** quedan excluidos.

### Historia 2 — El alumno confirma su lugar (Prioridad: P1)

Como **alumno seleccionado**, quiero confirmar mi asistencia para asegurar mi
lugar, y poder rechazarlo si no podré ir.

**Por qué esta prioridad:** sin confirmación, la organización llega al 9 de
noviembre sin saber cuántas butacas estarán realmente ocupadas.

**Prueba independiente:** un alumno seleccionado recibe la invitación, confirma
y obtiene su entrada.

**Escenarios de aceptación:**

1. **Dado** un alumno seleccionado, **Cuando** el sistema envía las
   invitaciones, **Entonces** recibe un correo con su lugar y la fecha límite
   para confirmar.
2. **Dado** una invitación vigente, **Cuando** el alumno confirma, **Entonces**
   su lugar queda asegurado y recibe su entrada.
3. **Dado** una invitación vigente, **Cuando** el alumno la rechaza,
   **Entonces** su cupo se libera de inmediato.
4. **Dado** una invitación cuyo plazo venció sin respuesta, **Cuando** pasa la
   fecha límite, **Entonces** el cupo se libera automáticamente.
5. **Dado** un alumno que ya confirmó, **Cuando** intenta rechazar después,
   **Entonces** `[NECESITA CLARIFICACIÓN: ¿se permite cancelar una confirmación? Si sí, ¿hasta cuándo? Liberar tarde un cupo puede dejarlo vacío.]`

### Historia 3 — La lista de espera se mueve sola (Prioridad: P2)

Como **alumno en lista de espera**, quiero acceder automáticamente si alguien
libera su lugar, para no depender de que alguien se acuerde de mí.

**Por qué esta prioridad:** evita butacas vacías y gestión manual en los días
previos, que es cuando la organización tiene menos tiempo disponible.

**Prueba independiente:** un seleccionado rechaza y el primero de la lista de
espera recibe su invitación sin intervención humana.

**Escenarios de aceptación:**

1. **Dado** un cupo liberado por rechazo o vencimiento, **Cuando** ocurre,
   **Entonces** el sistema invita automáticamente al primero de la lista de
   espera.
2. **Dado** un alumno promovido, **Cuando** recibe su invitación, **Entonces**
   dispone de su propio plazo de confirmación.
   `[NECESITA CLARIFICACIÓN: ¿el plazo de los promovidos es el mismo? A pocos días del evento debería ser más corto.]`
3. **Dado** que la lista de espera se agotó, **Cuando** se libera otro cupo,
   **Entonces** el sistema lo informa al administrador para que decida.
4. **Dado** la proximidad del evento, **Cuando** falta menos del margen mínimo
   de gestión, **Entonces** el sistema deja de promover automáticamente y avisa
   al administrador.
   `[NECESITA CLARIFICACIÓN: ¿cuántos días antes del evento se congela la promoción automática?]`

### Historia 4 — Control de acceso el día del evento (Prioridad: P2)

Como **staff en puerta**, quiero verificar rápidamente quién tiene derecho a
entrar para que el ingreso sea ordenado y nadie entre dos veces.

**Por qué esta prioridad:** ocurre una sola vez pero es el momento más visible
del proyecto. Un fallo aquí lo ve todo el auditorio.

**Prueba independiente:** se escanea una entrada válida y se admite; se escanea
la misma otra vez y se rechaza.

**Escenarios de aceptación:**

1. **Dado** un asistente con entrada válida, **Cuando** el staff la escanea,
   **Entonces** el sistema autoriza el ingreso y muestra su nombre.
2. **Dado** una entrada ya utilizada, **Cuando** se escanea de nuevo,
   **Entonces** el sistema la rechaza indicando la hora del primer ingreso.
3. **Dado** una persona sin entrada, **Cuando** se presenta, **Entonces** el
   sistema no la encuentra y el staff aplica el criterio de la organización.
4. **Dado** el ingreso en curso, **Cuando** el administrador lo consulta,
   **Entonces** ve cuántas personas han ingresado en tiempo real.

### Historia 5 — Los otros cupos (Prioridad: P3)

Como **administrador**, quiero asignar manualmente los cupos que no se disputan
por puntos para completar el aforo de 100 personas.

**Por qué esta prioridad:** necesario para el evento, pero no depende del
motor de puntos y puede resolverse en cualquier momento.

**Prueba independiente:** se asigna un cupo a un invitado externo y este recibe
su entrada.

**Escenarios de aceptación:**

1. **Dado** un administrador, **Cuando** asigna manualmente un cupo a una
   persona indicando su tipo de público, **Entonces** esa persona recibe su
   entrada.
2. **Dado** el aforo total, **Cuando** se intenta asignar un cupo que lo
   excedería, **Entonces** el sistema lo advierte.

---

## Casos límite

- **Un alumno gana puntos después del corte.** `[NECESITA CLARIFICACIÓN: ¿el ranking queda congelado del todo, o los puntos posteriores reordenan la lista de espera?]`
- **Un seleccionado es deshabilitado entre el corte y el evento.** Su cupo se
  libera y entra la lista de espera.
- **Nadie de la lista de espera confirma.** El administrador debe poder ver los
  cupos vacantes y decidir qué hacer con tiempo suficiente.
- **El evento se reprograma.** Todos los plazos de confirmación deben poder
  recalcularse sin rehacer la selección.
- **Un alumno confirma pero no asiste.** Queda registrado como ausente, dato
  útil para futuras ediciones.
- **Fallo de conectividad en la puerta el día del evento.** El control de acceso
  debe tener un procedimiento alternativo verificable, dado que un fallo deja a
  cien personas en la vereda.
  `[NECESITA CLARIFICACIÓN: ¿se prevé una lista impresa de respaldo como contingencia?]`
- **Concentración de cupos en una sola carrera.** Con ranking puro —la decisión
  tomada— es un resultado posible: la carrera más organizada puede llevarse la
  mayoría de los lugares. El sistema no lo impide, pero sí lo reporta
  (RF-407a), para que la organización lo sepa antes del evento y no después.

## Requisitos funcionales

- **RF-401:** El sistema DEBE permitir configurar el aforo total del evento y su
  distribución por tipo de público. **Los valores de 100 y 80 son la estimación
  actual, no una constante.** Deben poder cambiarse desde el sistema sin
  intervención de un desarrollador, incluso después de creado el evento.
- **RF-401a:** Cambiar el número de cupos DESPUÉS de ejecutar la asignación DEBE
  requerir revertirla explícitamente. Ampliar el aforo con invitaciones ya
  enviadas es un escenario legítimo (se consiguió un auditorio más grande), pero
  no puede ocurrir de forma silenciosa.
- **RF-402:** La asignación de cupos DEBE ejecutarse como una acción explícita
  del administrador, nunca de forma automática ni continua.
- **RF-403:** La asignación DEBE seleccionar a los alumnos mejor posicionados en
  el ranking hasta agotar el número de cupos estudiantiles configurado, sea cual
  sea ese número.
- **RF-404:** La asignación DEBE conservar, para cada persona seleccionada o en
  lista de espera, el puntaje y la posición que tenía en el momento del corte.
- **RF-405:** La asignación DEBE generar una lista de espera ordenada.
  `[NECESITA CLARIFICACIÓN: ¿de cuántos alumnos? Debe cubrir la tasa esperada de no confirmación.]`
- **RF-406:** El criterio de desempate DEBE ser determinista, documentado y
  comunicado a los alumnos antes del corte.
- **RF-407:** La asignación DEBE ser por ranking puro de puntos, **sin cuota por
  carrera ni por facultad**. (Decisión tomada el 2026-08-30.)
- **RF-407a:** El sistema DEBE reportar al administrador la distribución por
  carrera y facultad del resultado de la asignación. No altera la selección,
  pero permite a la organización saber si el evento quedó concentrado en una
  sola carrera y decidir con datos si quiere corregirlo en futuras ediciones.
- **RF-408:** La asignación NO DEBE poder ejecutarse dos veces sobre el mismo
  evento sin una reversión explícita y auditada.
- **RF-409:** Los alumnos deshabilitados DEBEN quedar excluidos de la
  asignación.
- **RF-410:** El sistema DEBE enviar una invitación a cada seleccionado, con su
  fecha límite de confirmación.
- **RF-411:** El plazo de confirmación DEBE ser configurable.
  `[NECESITA CLARIFICACIÓN: ¿cuántas horas? Se propuso entre 48 y 72, sin confirmar.]`
- **RF-412:** El alumno DEBE poder confirmar o rechazar su cupo desde su perfil.
- **RF-413:** Un cupo no confirmado dentro del plazo DEBE liberarse
  automáticamente.
- **RF-414:** Al liberarse un cupo, el sistema DEBE promover automáticamente al
  primero de la lista de espera e invitarlo.
- **RF-415:** El sistema DEBE dejar de promover automáticamente cuando falte
  menos de un margen mínimo para el evento, y avisar al administrador.
- **RF-416:** Cada cupo confirmado DEBE generar una entrada única e
  intransferible.
- **RF-417:** La entrada DEBE ser de un solo uso; un segundo intento DEBE
  rechazarse indicando la hora del primer ingreso.
- **RF-418:** El staff DEBE poder verificar entradas en la puerta y el sistema
  DEBE registrar el ingreso efectivo.
- **RF-419:** El administrador DEBE poder ver en tiempo real el aforo ocupado
  durante el ingreso.
- **RF-420:** El administrador DEBE poder asignar cupos manualmente a públicos
  que no se disputan por puntos.
  `[NECESITA CLARIFICACIÓN: los 20 cupos no estudiantiles, ¿son íntegramente asignación manual del administrador (docentes, invitados, organización), o alguna parte también se disputa por puntos?]`
- **RF-421:** El sistema DEBE permitir exportar la lista final de asistentes.
- **RF-422:** Toda ejecución, reversión, promoción y asignación manual DEBE
  quedar registrada en auditoría.
- **RF-423:** El sistema DEBE notificar a los alumnos no seleccionados su
  situación y su posición en lista de espera.
  `[NECESITA CLARIFICACIÓN: ¿se notifica también a quienes no entraron ni siquiera en lista de espera? Es una decisión de comunicación institucional con impacto emocional real.]`

## Entidades clave

- **Evento:** aforo total y distribución de cupos por tipo de público.
- **Cupo:** lugar asignado a una persona concreta. Recorre estados desde
  seleccionado hasta ingresado, pasando por invitado, confirmado, rechazado,
  vencido o en lista de espera.
- **Fotografía del corte:** puntaje y posición congelados en el instante de la
  asignación. Es la evidencia que justifica cada decisión.
- **Entrada:** credencial única de acceso al evento, de un solo uso.

## Criterios de éxito

- **CE-401:** El 100% de los cupos asignados puede justificarse con el puntaje y
  la posición registrados al momento del corte.
- **CE-402:** Al menos el 90% de los seleccionados confirma o rechaza dentro del
  plazo, sin recordatorios manuales de la organización.
- **CE-403:** Al menos el 95% del aforo estudiantil está ocupado el día del
  evento.
- **CE-404:** El ingreso de 100 personas se completa en menos de 20 minutos.
- **CE-405:** Cero casos de doble ingreso con la misma entrada.
- **CE-406:** Cero reclamos formales sobre la equidad del proceso que el sistema
  no pueda responder con evidencia registrada.

## Checklist de completitud

- [ ] No quedan marcadores `[NECESITA CLARIFICACIÓN]` — **10 abiertos** (RF-407 resuelto)
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] No hay detalles de implementación
- [x] Cada historia de usuario es probable de forma independiente
- [x] No hay features especulativas
- [x] Alcance delimitado con claridad
