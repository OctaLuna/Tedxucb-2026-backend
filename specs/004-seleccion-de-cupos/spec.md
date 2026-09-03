# Especificación: Selección y gestión de cupos

**Rama/ID:** `004-seleccion-de-cupos`
**Estado:** Clarificado — plan y tasks completos (`plan.md`, `data-model.md`,
`contracts/`, `tasks.md`)
**Entrada:** "a esa charla solamente pueden entrar 100 personas, unos 80 alumnos, ahora para escoger a los alumnos se tomará en cuenta por puntos"

## Contexto

Esta feature ejecuta la decisión que da sentido a todo el sistema: **quién
entra al TEDxUCB y quién no.** Se ejecuta pocas veces, cerca del evento, y cada
ejecución es difícil de revertir en términos humanos: una vez que se envió el
correo de invitación, no se puede deshacer.

Por eso el proceso es explícito y disparado por una persona, nunca un cálculo
en vivo. Y por eso cada decisión queda congelada: cuando alguien pregunte "¿por
qué él y yo no?", debe existir el número exacto que lo justifica, tal como
estaba en el momento de la selección.

## Alcance

**Sí cubre:** selección de los alumnos por ranking, asignación manual de los
demás lugares, aviso a los seleccionados, entradas y control de acceso el
día del evento.

**No cubre:** acumulación de puntos (`003`), venta de entradas al público
general. Tampoco confirmación del alumno, lista de espera, ni promoción
automática — el diseño original las incluía; se eliminaron **(resuelto
2026-09-03, ADR-009)**.

**Depende de:** `003-motor-de-puntos`.

---

## Historias de usuario

### Historia 1 — El administrador ejecuta la selección (Prioridad: P1)

Como **administrador**, quiero ejecutar la selección en el momento que yo
decida para determinar de forma justa y trazable qué alumnos asisten.

**Por qué esta prioridad:** es el propósito completo de esta feature.

**Prueba independiente:** con alumnos y puntajes cargados, se ejecuta la
selección y el sistema produce la lista de seleccionados.

**Escenarios de aceptación:**

1. **Dado** un ranking con más alumnos que lugares, **Cuando** el
   administrador ejecuta la selección, **Entonces** el sistema selecciona a
   los primeros según el número de lugares estudiantiles configurado
   (**resuelto 2026-09-03, ADR-009:** sin lista de espera — el resto
   simplemente no queda seleccionado).
2. **Dado** la selección ejecutada, **Cuando** se consulta a cualquier
   seleccionado, **Entonces** consta el puntaje y la posición que tenía en el
   momento exacto de la selección.
3. **Dado** dos alumnos con idéntico puntaje en el límite de la selección,
   **Cuando** se ejecuta la selección, **Entonces** el criterio de desempate
   se aplica de forma determinista y el resultado es reproducible.
4. **Dado** una asignación ya ejecutada, **Cuando** el administrador intenta
   ejecutarla de nuevo, **Entonces** el sistema lo impide salvo que la revierta
   explícitamente, y la reversión queda auditada.
5. **Dado** alumnos deshabilitados en el padrón, **Cuando** se ejecuta la
   asignación, **Entonces** quedan excluidos.

### Historia 2 — El alumno recibe su lugar (Prioridad: P1)

Como **alumno seleccionado**, quiero enterarme de inmediato de que tengo un
lugar y contar con mi entrada, sin pasos adicionales de mi parte.

**Por qué esta prioridad:** estar entre los mejores puntajes ya es la
decisión; no hace falta una acción extra del alumno para que quede en firme
(ver ADR-009 — se eliminó el paso de confirmación que tenía el diseño
original).

**Prueba independiente:** un alumno seleccionado recibe el aviso y su
entrada, sin ninguna acción propia pendiente.

**Escenarios de aceptación:**

1. **Dado** un alumno seleccionado, **Cuando** el sistema ejecuta la
   notificación, **Entonces** recibe un correo confirmando su lugar, junto
   con su entrada de acceso al evento.
2. **Dado** un alumno seleccionado, **Cuando** consulta su perfil,
   **Entonces** ve su lugar confirmado y puede acceder a su entrada en
   cualquier momento, no solo desde el correo inicial.

### Historia 3 — Control de acceso el día del evento (Prioridad: P2)

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

### Historia 4 — Los otros lugares (Prioridad: P3)

Como **administrador**, quiero asignar manualmente los lugares que no se
disputan por puntos para completar el aforo de 100 personas.

**Por qué esta prioridad:** necesario para el evento, pero no depende del
motor de puntos y puede resolverse en cualquier momento.

**Prueba independiente:** se asigna un lugar a un invitado externo y este
recibe su entrada.

**Escenarios de aceptación:**

1. **Dado** un administrador, **Cuando** asigna manualmente un lugar a una
   persona indicando su tipo de público, **Entonces** esa persona recibe su
   entrada.
2. **Dado** el aforo total, **Cuando** se intenta asignar un lugar que lo
   excedería, **Entonces** el sistema lo advierte.

---

## Casos límite

- **Un alumno gana puntos después de la selección.** No hay lista de espera
  que reordenar (**resuelto 2026-09-03, ADR-009**): la selección ya
  ejecutada es la lista final. Si el administrador quiere reconocerlo de
  todas formas, es una decisión suya y manual, igual que cualquier lugar
  liberado que decide llenar.
- **Un seleccionado es deshabilitado entre la selección y el evento.** Su
  lugar se libera; si el administrador quiere llenarlo, lo hace a mano
  (**ADR-009**) — no hay reemplazo automático.
- **El administrador ve lugares liberados sin nadie asignado.** Puede
  verlos y decidir qué hacer con tiempo suficiente — asignarlos a mano a
  otro alumno o dejarlos vacíos.
- **Un alumno seleccionado no asiste el día del evento.** Queda registrado
  como ausente (no se escaneó su entrada), dato útil para futuras
  ediciones.
- **Fallo de conectividad en la puerta el día del evento.** El control de
  acceso debe tener un procedimiento alternativo verificable, dado que un
  fallo deja a cien personas en la vereda. **Resuelto 2026-09-03:** se
  mantiene la contingencia de una lista impresa de respaldo, ya anotada en
  `docs/operacion-dia-del-evento.md` — la exportación de asistentes
  (RF-421) es lo que la hace posible, no hace falta un requisito nuevo.
- **Concentración de lugares en una sola carrera.** Con ranking puro —la
  decisión tomada— es un resultado posible: la carrera más organizada
  puede llevarse la mayoría de los lugares. El sistema no lo impide, pero
  sí lo reporta (RF-407a), para que la organización lo sepa antes del
  evento y no después.

## Requisitos funcionales

- **RF-401:** El sistema DEBE permitir configurar el aforo total del evento y su
  distribución por tipo de público. **Los valores de 100 y 80 son la estimación
  actual, no una constante.** Deben poder cambiarse desde el sistema sin
  intervención de un desarrollador, incluso después de creado el evento.
- **RF-401a:** Cambiar el número de lugares DESPUÉS de ejecutar la selección
  DEBE requerir revertirla explícitamente. Ampliar el aforo con avisos ya
  enviados es un escenario legítimo (se consiguió un auditorio más grande), pero
  no puede ocurrir de forma silenciosa.
- **RF-402:** La selección DEBE ejecutarse como una acción explícita del
  administrador, en el momento que decida — nunca de forma automática ni
  continua.
- **RF-403:** La selección DEBE elegir a los alumnos mejor posicionados en
  el ranking hasta agotar el número de lugares estudiantiles configurado, sea
  cual sea ese número.
- **RF-404:** La selección DEBE conservar, para cada persona seleccionada,
  el puntaje y la posición que tenía en el momento de ejecutarse.
- ~~**RF-405**~~ **eliminado 2026-09-03 (ADR-009):** generaba una lista de
  espera ordenada; no hay lista de espera en el modelo actual.
- **RF-406:** El criterio de desempate DEBE ser determinista, documentado y
  comunicado a los alumnos antes de la selección.
- **RF-407:** La selección DEBE ser por ranking puro de puntos, **sin cuota por
  carrera ni por facultad**. (Decisión tomada el 2026-08-30.)
- **RF-407a:** El sistema DEBE reportar al administrador la distribución por
  carrera y facultad del resultado de la selección. No altera el resultado,
  pero permite a la organización saber si el evento quedó concentrado en una
  sola carrera y decidir con datos si quiere corregirlo en futuras ediciones.
- **RF-408:** La selección NO DEBE poder ejecutarse dos veces sobre el mismo
  evento sin una reversión explícita y auditada.
- **RF-409:** Los alumnos deshabilitados DEBEN quedar excluidos de la
  selección.
- **RF-410:** El sistema DEBE enviar un aviso a cada seleccionado, confirmando
  su lugar y con su entrada de acceso. **Reescrito 2026-09-03 (ADR-009):**
  sin fecha límite de confirmación — estar seleccionado y recibir el aviso ya
  deja el lugar en firme, sin un paso adicional del alumno.
- ~~**RF-411**~~ a ~~**RF-415**~~ **eliminados 2026-09-03 (ADR-009):** plazo
  de confirmación configurable, confirmar/rechazar desde el perfil,
  liberación automática al vencer, promoción automática de lista de espera,
  y su congelamiento cerca del evento — ninguno aplica sin confirmación ni
  lista de espera. Un lugar liberado después de la selección solo se llena
  si el administrador decide hacerlo a mano (ver caso límite
  correspondiente).
- **RF-416:** Cada persona seleccionada DEBE generar una entrada única e
  intransferible.
- **RF-417:** La entrada DEBE ser de un solo uso; un segundo intento DEBE
  rechazarse indicando la hora del primer ingreso.
- **RF-418:** El staff DEBE poder verificar entradas en la puerta y el sistema
  DEBE registrar el ingreso efectivo.
- **RF-419:** El administrador DEBE poder ver en tiempo real el aforo ocupado
  durante el ingreso.
- **RF-420:** El administrador DEBE poder asignar lugares manualmente a
  públicos que no se disputan por puntos. **Resuelto 2026-09-03:** esos
  ~20 lugares (docentes, invitados, organización) son íntegramente de
  asignación manual del administrador — ninguna parte se disputa por
  puntos.
- **RF-421:** El sistema DEBE permitir exportar la lista final de asistentes.
- **RF-422:** Toda ejecución, reversión y asignación manual (incluida la
  reasignación de un lugar liberado) DEBE quedar registrada en auditoría.
- **RF-423:** **Resuelto 2026-09-03 (ADR-009):** el sistema NO notifica a
  los alumnos que no fueron seleccionados. Cualquier alumno puede consultar
  su propio puntaje y posición en su perfil (`003`) cuando quiera; el
  sistema no les envía nada de forma proactiva.

## Entidades clave

- **Evento:** aforo total y distribución de lugares por tipo de público.
- **Selección:** un lugar asignado a una persona concreta (alumno por
  ranking, o alguien asignado a mano). Guarda el puntaje y la posición que
  tenía la persona en el momento de la selección (RF-404). Sin estados
  intermedios de invitación/confirmación: una persona está seleccionada, o
  no lo está (ADR-009).
- **Ejecución:** un registro de cada vez que el administrador corre la
  selección — cuándo, quién, con qué aforo configurado, y si fue revertida.
- **Entrada:** credencial única de acceso al evento, de un solo uso.

## Criterios de éxito

- **CE-401:** El 100% de los lugares asignados puede justificarse con el
  puntaje y la posición registrados al momento de la selección.
- ~~**CE-402**~~ **eliminado 2026-09-03 (ADR-009):** medía la tasa de
  confirmación/rechazo dentro de un plazo; no aplica sin ese paso.
- **CE-403:** Al menos el 95% del aforo estudiantil está ocupado el día del
  evento.
- **CE-404:** El ingreso de 100 personas se completa en menos de 20 minutos.
- **CE-405:** Cero casos de doble ingreso con la misma entrada.
- **CE-406:** Cero reclamos formales sobre la equidad del proceso que el sistema
  no pueda responder con evidencia registrada.

## Checklist de completitud

- [x] No quedan marcadores `[NECESITA CLARIFICACIÓN]` — **0 abiertos** (ver ADR-009, 2026-09-03)
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] No hay detalles de implementación
- [x] Cada historia de usuario es probable de forma independiente
- [x] No hay features especulativas
- [x] Alcance delimitado con claridad
