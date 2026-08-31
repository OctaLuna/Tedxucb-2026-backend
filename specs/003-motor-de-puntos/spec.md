# Especificación: Motor de puntos y participación

**Rama/ID:** `003-motor-de-puntos`
**Estado:** Borrador — pendiente de clarificación
**Entrada:** "en la universidad tendremos una charla ted, y a esa charla solamente pueden entrar 100 personas, unos 80 alumnos, ahora para escoger a los alumnos se tomará en cuenta por puntos, y cada punto se gana cuando ellos participan de alguna cosa y ahí se les daría puntos, y todo eso lo haremos mediante una página web, donde mediante tracking o alguna otra cosa un QR o algo cuando un estudiante participa el dueño de ese lugar le asigna los puntos respectivos y eso se le carga a su perfil automáticamente y los alumnos pueden ver su progreso para ver cuántos puntos tienen"

## Contexto

El aforo del evento es de 100 personas, de las cuales 80 son alumnos. La
demanda supera la oferta, y la organización decidió resolverlo por mérito: los
alumnos acumulan puntos participando en actividades previas, y esos puntos
determinan quién entra.

Esa decisión traslada todo el peso a esta feature. **Un sistema de puntos poco
confiable no produce un ranking discutible: produce un ranking ilegítimo.** Si
un alumno queda en el puesto 81 y sospecha que le faltó un punto que sí ganó,
el problema no es técnico sino de confianza en la institución que organiza el
evento.

De ahí el Artículo IV de la constitución del proyecto, y de ahí que esta sea la
feature de mayor riesgo, la que más pruebas necesita y la primera en tener
contratos escritos.

## Alcance

**Sí cubre:** catálogo de actividades, asignación de staff, registro validado de
participación, otorgamiento automático de puntos, historial del alumno,
correcciones y reversiones, reclamos, ranking y prevención de fraude.

**No cubre:** asignación de cupos del evento (`004`), gestión de usuarios
(`001`).

**Depende de:** `001-identidad-y-usuarios`.

---

## Historias de usuario

### Historia 1 — El staff registra la participación (Prioridad: P1)

Como **miembro del staff**, quiero registrar en el momento que un alumno
participó en mi actividad para que reciba sus puntos sin trámite posterior.

**Por qué esta prioridad:** es el acto que genera todos los datos del sistema.
Nada más funciona si esto no funciona.

**Prueba independiente:** con una actividad creada y un alumno registrado, el
staff lo escanea y los puntos aparecen en el perfil del alumno.

**Escenarios de aceptación:**

1. **Dado** un staff asignado a una actividad en curso, **Cuando** escanea el
   código de un alumno, **Entonces** el sistema registra su participación,
   le otorga los puntos de esa actividad y muestra al staff el nombre del
   alumno, su foto y el nuevo total.
2. **Dado** un alumno ya registrado en esa actividad, **Cuando** el staff lo
   escanea otra vez, **Entonces** el sistema lo rechaza indicando la hora del
   registro previo, y **no** otorga puntos adicionales.
3. **Dado** un staff que no está asignado a esa actividad, **Cuando** intenta
   registrar a un alumno, **Entonces** el sistema se lo deniega.
4. **Dado** una actividad cuya ventana de registro aún no abrió o ya cerró,
   **Cuando** el staff intenta registrar, **Entonces** el sistema lo rechaza
   indicando el motivo.
5. **Dado** un código de alumno capturado en pantalla y reutilizado pasado su
   tiempo de validez, **Cuando** se escanea, **Entonces** el sistema lo rechaza
   por vencido.
6. **Dado** que la red falla tras registrar y el staff reintenta la misma
   operación, **Cuando** el reintento llega, **Entonces** el sistema reconoce
   que es el mismo registro y **no** duplica los puntos.

### Historia 2 — El alumno ve su progreso (Prioridad: P1)

Como **alumno**, quiero ver cuántos puntos tengo y de dónde salió cada uno para
confiar en el sistema y saber cuánto me falta.

**Por qué esta prioridad:** es lo que convierte el sistema en un incentivo. Un
puntaje que el alumno no puede consultar ni explicar no motiva a nadie.

**Prueba independiente:** un alumno con participaciones registradas entra a su
perfil y ve su total y su historial.

**Escenarios de aceptación:**

1. **Dado** un alumno con participaciones registradas, **Cuando** abre su
   perfil, **Entonces** ve su puntaje total y su posición en el ranking.
2. **Dado** ese mismo alumno, **Cuando** abre su historial, **Entonces** ve cada
   movimiento con fecha, actividad, puntos y motivo, ordenados
   cronológicamente.
3. **Dado** un alumno al que se le revirtió una carga errónea, **Cuando** revisa
   su historial, **Entonces** ve tanto la carga original como su reversión, cada
   una con su explicación. Nunca ve un puntaje que cambió sin justificación.
4. **Dado** un alumno recién activado sin participaciones, **Cuando** abre su
   perfil, **Entonces** ve cero puntos y una indicación de cómo empezar a
   ganarlos.

### Historia 3 — El administrador gobierna las actividades (Prioridad: P1)

Como **administrador**, quiero definir qué actividades otorgan puntos, cuántos,
y quién puede validarlas, para controlar las reglas del juego.

**Por qué esta prioridad:** sin actividades no hay nada que escanear.

**Prueba independiente:** se crea una actividad, se publica, se le asigna staff
y esa persona puede validar en ella.

**Escenarios de aceptación:**

1. **Dado** un administrador, **Cuando** crea una actividad con su valor en
   puntos y su ventana de registro, **Entonces** queda en borrador, sin ser
   visible ni utilizable.
2. **Dado** una actividad en borrador, **Cuando** el administrador la publica y
   le asigna staff, **Entonces** ese staff la ve entre sus actividades y puede
   validar en ella.
3. **Dado** una actividad con participaciones ya registradas, **Cuando** el
   administrador cambia su valor en puntos, **Entonces** los puntos ya otorgados
   **no** se recalculan y el nuevo valor rige solo hacia adelante.
4. **Dado** una actividad con participaciones registradas, **Cuando** el
   administrador intenta eliminarla, **Entonces** el sistema lo impide y ofrece
   cancelarla en su lugar.

### Historia 4 — Corregir errores sin borrar la historia (Prioridad: P1)

Como **administrador**, quiero corregir puntos mal otorgados dejando constancia
de la corrección, para que el sistema sea defendible ante un reclamo.

**Por qué esta prioridad:** los errores van a ocurrir. Lo que define la
legitimidad del sistema no es la ausencia de errores sino cómo se corrigen.

**Prueba independiente:** se revierte una carga y el historial muestra ambas
transacciones.

**Escenarios de aceptación:**

1. **Dado** una carga de puntos errónea, **Cuando** el administrador la
   revierte indicando el motivo, **Entonces** el puntaje del alumno se ajusta y
   el historial conserva ambos movimientos.
2. **Dado** un alumno que merece un reconocimiento extraordinario, **Cuando** el
   administrador le otorga un bono con motivo, **Entonces** el bono aparece
   identificado como tal en el historial.
3. **Dado** un intento de ajuste sin motivo, **Cuando** se envía, **Entonces**
   el sistema lo rechaza.
4. **Dado** una penalización mayor que el puntaje actual del alumno, **Cuando**
   se aplica, **Entonces** el puntaje queda en cero y nunca en negativo.
5. **Dado** cualquier corrección, **Cuando** se ejecuta, **Entonces** queda
   registrada en auditoría con su autor.

### Historia 5 — El alumno reclama un punto faltante (Prioridad: P2)

Como **alumno**, quiero reportar que participé en una actividad y no se me
acreditó, para que la organización lo revise.

**Por qué esta prioridad:** con 80 cupos en juego, esto **va a pasar**. Sin un
canal formal, el reclamo llegará igual —por WhatsApp, por pasillo, por
insistencia— y se resolverá de forma opaca y desigual. Ese es exactamente el
escenario que destruye la legitimidad del sistema.

**Prueba independiente:** un alumno abre un reclamo sobre una actividad y el
administrador lo resuelve.

**Escenarios de aceptación:**

1. **Dado** un alumno que no ve una participación esperada, **Cuando** abre un
   reclamo indicando la actividad y su explicación, **Entonces** el reclamo
   queda registrado y visible para el administrador.
2. **Dado** un reclamo procedente, **Cuando** el administrador lo aprueba,
   **Entonces** se registra la participación, se otorgan los puntos y el
   historial lo identifica como resultado de un reclamo.
3. **Dado** un reclamo improcedente, **Cuando** el administrador lo rechaza con
   motivo, **Entonces** el alumno puede ver la respuesta.
4. **Dado** el cierre de la fecha de corte, **Cuando** un alumno intenta abrir
   un reclamo, **Entonces** el sistema lo rechaza si el plazo ya venció.
   `[NECESITA CLARIFICACIÓN: ¿cuántos días antes del corte se cierran los reclamos? Debe haber margen para resolverlos.]`

### Historia 6 — Nadie infla su puntaje (Prioridad: P1)

Como **organización**, queremos que sea impracticable acumular puntos sin haber
participado realmente, para que el ranking sea legítimo.

**Por qué esta prioridad:** el riesgo aquí no es técnico sino social. Con cupos
escasos y disputados, habrá intentos. Si el sistema es evadible y se nota, todo
el proceso pierde autoridad.

**Prueba independiente:** se intentan los vectores conocidos de abuso y el
sistema los rechaza.

**Escenarios de aceptación:**

1. **Dado** una captura de pantalla del código de un alumno compartida con
   terceros, **Cuando** se intenta usar después de su vencimiento, **Entonces**
   es rechazada.
2. **Dado** un mismo dispositivo que registra a un número inusualmente alto de
   alumnos distintos en poco tiempo, **Cuando** ocurre, **Entonces** el sistema
   lo señala como anomalía para revisión.
3. **Dado** un registro hecho manualmente por el staff, **Cuando** se consulta
   el historial, **Entonces** aparece identificado como manual y con la
   justificación que se exigió al registrarlo.
4. **Dado** un intento de registrar participación fuera de la ventana horaria,
   **Cuando** se envía, **Entonces** es rechazado.

---

## Casos límite

- **El celular del alumno se quedó sin batería.** El staff registra manualmente
  buscándolo por nombre o código, con justificación obligatoria. Queda marcado
  como manual y es revisable después.
- **Actividad cancelada después de haber otorgado puntos.** Al cancelar, el
  sistema pregunta al administrador si revierte en bloque los puntos ya
  otorgados. No decide solo: puede ser justo conservarlos si los alumnos ya
  habían asistido.
- **Actividad con cupo lleno.** `[NECESITA CLARIFICACIÓN: si la actividad tiene cupo máximo y llega un alumno adicional, ¿se le niega el registro o se le permite entrar sin puntos?]`
- **Dos miembros del staff escanean al mismo alumno simultáneamente.** Solo uno
  de los registros prospera; el otro recibe el rechazo por duplicado.
- **Empate exacto de puntaje entre dos alumnos.** Se resuelve por antigüedad: gana
  quien alcanzó ese puntaje primero. Con 80 cupos, un empate en el límite es
  prácticamente seguro y el criterio debe estar definido de antemano.
- **Alumno deshabilitado con puntaje acumulado.** Conserva su historial pero sale
  del ranking.
- **Actividad que se extiende más allá de su horario previsto.** El
  administrador puede ampliar la ventana de registro mientras esté abierta.
- **El alumno participa pero olvida que lo escanearon.** El historial es la
  respuesta: puede verificarlo por sí mismo antes de reclamar.

## Requisitos funcionales

### Actividades

- **RF-301:** El administrador DEBE poder crear actividades con título,
  descripción, categoría, lugar, fechas de inicio y fin, ventana de registro y
  valor en puntos.
- **RF-302:** El valor en puntos de una actividad DEBE ser mayor que cero.
- **RF-303:** Las actividades DEBEN tener estados diferenciados: borrador,
  publicada, cerrada y cancelada. Solo las publicadas admiten registros.
- **RF-304:** El administrador DEBE poder asignar y retirar miembros del staff a
  cada actividad.
- **RF-305:** Un miembro del staff solo DEBE poder registrar participación en
  las actividades donde esté asignado.
- **RF-306:** Cambiar el valor en puntos de una actividad NO DEBE alterar los
  puntos ya otorgados.
- **RF-307:** Una actividad con participaciones registradas NO DEBE poder
  eliminarse; solo cancelarse.
- **RF-308:** Al cancelar una actividad, el sistema DEBE ofrecer al
  administrador revertir en bloque los puntos ya otorgados por ella.
- **RF-309:** El sistema DEBE mantener un catálogo de categorías de actividad
  gestionable por el administrador.
- **RF-310:** El administrador DEBE definir el valor en puntos de cada actividad
  en el momento de crearla. El sistema NO impone una escala fija.
- **RF-310a:** Cada categoría de actividad DEBE poder tener un valor sugerido
  que se proponga al crear una actividad de esa categoría, editable por el
  administrador. Sin una referencia visible, dos actividades equivalentes
  creadas por la misma persona en semanas distintas terminan valiendo distinto,
  y esa incoherencia es lo primero que un alumno señala al reclamar.
- **RF-310b:** El sistema DEBE mostrar al administrador el valor de las
  actividades ya creadas al definir una nueva, para mantener coherencia.
- **RF-310c:** El catálogo de actividades con su valor en puntos DEBE ser
  consultable por los alumnos antes de participar. Las reglas del juego se
  comunican antes, no después.

### Registro de participación

- **RF-311:** El alumno DEBE poder generar desde su perfil un código
  identificatorio para ser escaneado.
- **RF-312:** Ese código DEBE tener validez temporal corta y renovarse
  automáticamente, de modo que una captura de pantalla no sea reutilizable.
- **RF-313:** La validez del código DEBE verificarse en el servidor, nunca en el
  dispositivo que escanea.
- **RF-314:** El sistema DEBE registrar la participación y otorgar los puntos en
  una única operación indivisible: nunca puede quedar un registro sin puntos ni
  puntos sin registro.
- **RF-315:** Un alumno solo DEBE poder recibir puntos una vez por actividad,
  salvo que la actividad admita registros múltiples de forma explícita.
- **RF-316:** El registro solo DEBE aceptarse dentro de la ventana de registro
  definida para la actividad.
- **RF-317:** Reintentar la misma operación de registro NO DEBE producir un
  segundo abono de puntos.
- **RF-318:** El sistema DEBE devolver al staff una confirmación visual con el
  nombre y la fotografía del alumno registrado y su nuevo total.
- **RF-319:** El sistema DEBE permitir el registro manual por parte del staff,
  exigiendo una justificación escrita.
- **RF-320:** Todo registro DEBE almacenar el método empleado, quién lo validó y
  cuándo.
- **RF-321:** El sistema DEBE registrar información del dispositivo y el origen
  de cada registro para detectar anomalías.
- **RF-322:** El sistema DEBE señalar como anomalía cuando un mismo dispositivo
  registra a un número inusual de alumnos distintos en un intervalo corto.
  `[NECESITA CLARIFICACIÓN: ¿qué umbral se considera inusual? Depende del tamaño típico de las actividades.]`
- **RF-323:** El sistema DEBE ofrecer una alternativa de registro para
  actividades masivas donde el escaneo individual sea impracticable.
  `[NECESITA CLARIFICACIÓN: ¿existen actividades con asistencia masiva donde escanear uno por uno no sea viable? Si es así, cuántos asistentes.]`

### Puntos e historial

- **RF-324:** El puntaje de un alumno DEBE ser siempre igual a la suma de sus
  movimientos registrados.
- **RF-325:** Los movimientos de puntos NO DEBEN poder modificarse ni
  eliminarse.
- **RF-326:** Toda corrección DEBE realizarse mediante un movimiento nuevo que
  referencie al original.
- **RF-327:** Todo movimiento DEBE registrar su tipo, su motivo y su autor.
- **RF-328:** El puntaje de un alumno NUNCA DEBE ser negativo.
- **RF-329:** El alumno DEBE poder consultar su historial completo con el motivo
  de cada movimiento.
- **RF-330:** El administrador DEBE poder otorgar bonos, aplicar penalizaciones
  y revertir movimientos, siempre con motivo.
- **RF-331:** El staff NO DEBE poder ajustar puntos fuera del registro de
  participación.
- **RF-332:** El sistema DEBE verificar periódicamente que el puntaje agregado
  de cada alumno coincida con la suma de sus movimientos, y alertar si difiere.
- **RF-333:** El sistema DEBE permitir recalcular el puntaje de un alumno desde
  su historial completo.

### Reclamos

- **RF-334:** El alumno DEBE poder abrir un reclamo por una participación no
  acreditada, indicando la actividad y su explicación.
- **RF-335:** El administrador DEBE poder aprobar o rechazar reclamos con
  motivo, y el alumno DEBE poder ver la resolución.
- **RF-336:** Un reclamo aprobado DEBE generar el registro de participación y
  los puntos correspondientes, identificados como originados en un reclamo.
- **RF-337:** Los reclamos DEBEN cerrarse antes de la fecha de corte del
  ranking.

### Ranking

- **RF-338:** El sistema DEBE producir un ranking de alumnos activos ordenado
  por puntaje.
- **RF-339:** Los empates DEBEN resolverse de forma determinista y documentada:
  precede quien alcanzó ese puntaje primero.
- **RF-340:** Los alumnos deshabilitados NO DEBEN aparecer en el ranking.
- **RF-341:** El administrador DEBE poder consultar el ranking filtrado por
  carrera y facultad, y exportarlo.
- **RF-342:** El alumno DEBE poder conocer su propia posición.
  `[NECESITA CLARIFICACIÓN: ¿el ranking completo es visible para todos los alumnos, o cada uno ve solo su posición? Un ranking público motiva, pero también expone y puede generar fricción entre compañeros.]`

## Entidades clave

- **Actividad:** ocasión de participar que otorga puntos. Tiene valor, ventana
  de registro, estado y staff asignado.
- **Categoría de actividad:** agrupación para organizar y comunicar el catálogo.
- **Registro de participación:** constancia de que un alumno participó en una
  actividad, con el método y el validador.
- **Movimiento de puntos:** unidad indivisible del historial. Positivo o
  negativo, con tipo, motivo, autor y referencia a lo que lo originó. Es la
  fuente de verdad del puntaje.
- **Reclamo:** solicitud de un alumno para revisar una participación no
  acreditada.
- **Código de identificación del alumno:** credencial temporal que permite al
  staff identificarlo en el momento del registro.

## Criterios de éxito

- **CE-301:** El registro de un alumno tarda menos de 5 segundos desde que el
  staff abre el escáner hasta la confirmación en pantalla.
- **CE-302:** Cero casos de puntos duplicados por la misma participación durante
  toda la operación del evento.
- **CE-303:** El puntaje agregado coincide con la suma del historial para el
  100% de los alumnos, verificado a diario.
- **CE-304:** Menos del 5% de los registros se realiza por vía manual. Un valor
  alto indicaría que el mecanismo principal no funciona en campo.
- **CE-305:** Menos del 3% de los alumnos activos abre un reclamo, y el 100% de
  los reclamos se resuelve antes de la fecha de corte.
- **CE-306:** Al menos el 60% de los alumnos activos consulta su progreso al
  menos una vez por semana durante la campaña.
- **CE-307:** Cero incidentes confirmados de puntos obtenidos sin participación
  real.

## Checklist de completitud

- [ ] No quedan marcadores `[NECESITA CLARIFICACIÓN]` — **6 abiertos** (RF-310 resuelto)
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] No hay detalles de implementación
- [x] Cada historia de usuario es probable de forma independiente
- [x] No hay features especulativas
- [x] Alcance delimitado con claridad
