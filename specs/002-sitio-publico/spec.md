# Especificación: Sitio público TEDxUCB

**Rama/ID:** `002-sitio-publico`
**Estado:** Borrador — pendiente de clarificación
**Entrada:** "Necesitamos: una sección en la que se explique la temática. Una sección para Speakers, en la cual compartiremos su fotografía y una breve reseña (aún no tenemos speakers confirmados). Una sección tipo 'save the date', para mostrar una cuenta atrás al evento. Hay sitios como tedxsitges.com o tedxsurco.com que tienen contenido similar a que queremos, para poder guiarnos."

## Contexto

La UCB Sede La Paz está en la primera fase del TEDxUCB: invitar a los perfiles
más destacados de su ecosistema a expresar interés en subir al escenario del 9
de noviembre.

La línea temática es la **Sostenibilidad** en sentido amplio y sistémico —
viabilidad, equilibrio, gobernanza y permanencia a largo plazo—, abordada desde
el área de expertise de cada disciplina: economía, ciencias, arte, gestión del
talento, infraestructura.

El formato TED se rige por la premisa de **"hablar a la cabeza, no al
corazón"**. No se buscan discursos de autoayuda, anécdotas puramente personales
ni mensajes motivacionales, sino ideas conceptuales basadas en evidencia,
investigación y aplicabilidad real, que desafíen los paradigmas actuales.

Esa premisa no es solo contenido editorial: **debe estar incrustada en el
formulario de postulación**, porque el formulario es el filtro real. Si pide
"contanos tu historia", llegarán historias.

## Alcance

**Sí cubre:** sección de temática, sección de speakers, cuenta atrás,
formulario de postulación, panel de gestión de contenido y revisión de
postulaciones.

**No cubre:** venta o reserva de entradas al público general, streaming,
publicación de videos, sistema de puntos.

**Dependencia:** solo del rol administrador de `001`, para editar el contenido.
**No depende del motor de puntos y puede publicarse antes que él.**

---

## Historias de usuario

### Historia 1 — Un visitante entiende de qué va el evento (Prioridad: P1)

Como **miembro de la comunidad universitaria**, quiero entender qué es TEDxUCB
y cuál es su línea temática para decidir si me interesa participar o asistir.

**Por qué esta prioridad:** es la razón de existir del sitio. Sin esto, no hay
nada que comunicar y ninguna postulación tiene sentido.

**Prueba independiente:** un visitante sin cuenta entra al sitio y comprende el
evento, su temática y su fecha, sin necesidad de contactar a nadie.

**Escenarios de aceptación:**

1. **Dado** un visitante sin autenticar, **Cuando** entra al sitio, **Entonces**
   ve el nombre del evento, su fecha, su sede y la explicación de la línea
   temática de sostenibilidad.
2. **Dado** un administrador, **Cuando** edita el texto de la sección de
   temática, **Entonces** el cambio se refleja en el sitio público sin necesidad
   de desplegar código nuevo.
3. **Dado** un visitante en un teléfono móvil, **Cuando** navega el sitio,
   **Entonces** todo el contenido es legible y utilizable sin desplazamiento
   horizontal.

### Historia 2 — Cuenta atrás al 9 de noviembre (Prioridad: P1)

Como **visitante**, quiero ver cuánto falta para el evento para registrarlo en
mi calendario y sentir su proximidad.

**Por qué esta prioridad:** es el "save the date" pedido explícitamente y el
elemento que genera expectativa desde el primer día de publicación.

**Prueba independiente:** el contador se muestra correctamente sin ningún otro
contenido cargado.

**Escenarios de aceptación:**

1. **Dado** que faltan días para el evento, **Cuando** el visitante abre el
   sitio, **Entonces** ve el tiempo restante desglosado y actualizándose.
2. **Dado** que el reloj del dispositivo del visitante está desajustado,
   **Cuando** se muestra el contador, **Entonces** el cálculo se apoya en la
   hora del servidor y no en la del dispositivo.
3. **Dado** que la fecha del evento ya pasó, **Cuando** el visitante entra,
   **Entonces** el sitio muestra un mensaje de evento finalizado en lugar de un
   contador en negativo.
4. **Dado** que el administrador modifica la fecha del evento, **Cuando** un
   visitante recarga, **Entonces** el contador refleja la nueva fecha.

### Historia 3 — Speakers (Prioridad: P2)

Como **visitante**, quiero conocer quiénes hablarán y sobre qué para decidir si
quiero asistir.

**Por qué esta prioridad:** imprescindible para el evento, pero **aún no hay
speakers confirmados**. La sección debe existir y comportarse dignamente
mientras esté vacía.

**Prueba independiente:** se carga un speaker de prueba, se publica y aparece;
se despublica y desaparece.

**Escenarios de aceptación:**

1. **Dado** que no hay ningún speaker publicado, **Cuando** el visitante llega a
   la sección, **Entonces** ve un estado de "próximamente" coherente con el
   diseño, nunca una sección rota o vacía.
2. **Dado** un speaker cargado pero sin publicar, **Cuando** un visitante entra,
   **Entonces** ese speaker no es visible por ningún medio.
3. **Dado** varios speakers publicados, **Cuando** el administrador reordena la
   lista, **Entonces** el sitio los muestra en el nuevo orden.
4. **Dado** un speaker publicado, **Cuando** el visitante lo ve, **Entonces**
   encuentra su fotografía, su nombre, una reseña breve y el título de su
   charla.

### Historia 4 — Postulación de speakers (Prioridad: P1)

Como **perfil destacado de la comunidad UCB**, quiero expresar mi interés en
subir al escenario presentando mi idea, para ser considerado por la
organización.

**Por qué esta prioridad:** es el objetivo declarado de esta primera fase. El
sitio existe, ante todo, para producir postulaciones.

**Prueba independiente:** una persona sin cuenta envía una postulación y esta
aparece en el panel del administrador.

**Escenarios de aceptación:**

1. **Dado** un visitante interesado, **Cuando** completa el formulario con su
   idea, la evidencia que la respalda y su aplicabilidad, **Entonces** la
   postulación se registra y recibe confirmación por correo.
2. **Dado** un formulario incompleto, **Cuando** intenta enviarlo, **Entonces**
   el sistema le indica con precisión qué falta.
3. **Dado** un administrador, **Cuando** abre el panel de postulaciones,
   **Entonces** ve todas las recibidas con su estado y puede filtrarlas.
4. **Dado** una postulación aceptada, **Cuando** el administrador la promueve a
   speaker, **Entonces** se crea la ficha de speaker con los datos ya provistos,
   en estado no publicado.
5. **Dado** un intento de envío automatizado masivo, **Cuando** se supera el
   límite de envíos, **Entonces** el sistema los bloquea sin afectar a los
   usuarios legítimos.

---

## Casos límite

- **Nadie postula en las primeras semanas.** El administrador necesita ver el
  conteo para reaccionar a tiempo. La sección de postulaciones muestra cuántas
  se recibieron aunque sean cero.
- **Una misma persona postula varias veces.** No se bloquea —puede estar
  corrigiendo—, pero el panel agrupa por correo y señala los duplicados.
- **Postulación que claramente no encaja con el formato TED** (autoayuda,
  anécdota personal). Se rechaza con un estado propio, para poder medir cuántas
  llegan así y ajustar el texto del formulario si son muchas.
- **Foto de speaker de proporciones inadecuadas.** El sistema debe encuadrar de
  forma consistente para que la grilla no se rompa.
- **Se cancela o reprograma el evento.** El administrador cambia la fecha y todo
  el sitio se ajusta, sin valores fijos escritos en el código.
- **Un speaker publicado se baja a último momento.** Debe poder despublicarse de
  inmediato, sin borrar su ficha.

## Requisitos funcionales

- **RF-201:** El sitio DEBE ser accesible sin autenticación.
- **RF-202:** El sitio DEBE presentar una sección que explique el evento y su
  línea temática de sostenibilidad en sentido amplio y sistémico.
- **RF-203:** El contenido de las secciones informativas DEBE ser editable por
  el administrador desde el sistema, sin intervención de un desarrollador.
- **RF-204:** El sitio DEBE mostrar una cuenta atrás hasta la fecha y hora del
  evento, calculada a partir de la hora del servidor.
- **RF-205:** El sitio DEBE manejar con elegancia el estado posterior al evento,
  sin contadores negativos.
- **RF-206:** El sitio DEBE tener una sección de speakers con fotografía,
  nombre, titular, reseña breve y título de la charla.
- **RF-207:** Cada speaker DEBE tener un estado de publicación independiente;
  los no publicados no DEBEN ser visibles públicamente por ningún medio.
- **RF-208:** La sección de speakers DEBE mostrar un estado de "próximamente"
  mientras no haya ninguno publicado.
- **RF-209:** El administrador DEBE poder definir el orden de aparición de los
  speakers.
- **RF-210:** El sitio DEBE ofrecer un formulario público de postulación que
  solicite, como mínimo: nombre, correo, afiliación, área de expertise, título
  de la idea, resumen de la idea, base de evidencia y aplicabilidad real.
- **RF-211:** El formulario DEBE comunicar explícitamente la premisa de "hablar
  a la cabeza, no al corazón" y qué tipo de propuestas no se buscan.
- **RF-212:** El formulario DEBE estar protegido contra envíos automatizados y
  limitar la frecuencia de envío.
- **RF-213:** Cada postulación DEBE generar una confirmación por correo al
  postulante.
  `[NECESITA CLARIFICACIÓN: ¿el correo de confirmación anuncia plazos o próximos pasos? Si sí, ¿cuáles?]`
- **RF-214:** El administrador DEBE poder listar, filtrar, abrir y cambiar el
  estado de las postulaciones, y dejar notas internas.
- **RF-215:** El administrador DEBE poder convertir una postulación aceptada en
  ficha de speaker sin recapturar los datos.
- **RF-216:** El sitio DEBE ser utilizable en pantallas de teléfono móvil.
- **RF-217:** El sitio DEBE cumplir pautas básicas de accesibilidad: contraste
  suficiente, textos alternativos en imágenes y navegación por teclado.
  `[NECESITA CLARIFICACIÓN: ¿la universidad exige algún nivel formal de conformidad, por ejemplo WCAG 2.1 AA?]`
- **RF-218:** El sitio DEBE exponer metadatos para compartir en redes sociales
  con vista previa correcta.
- **RF-219:** El sitio DEBE respetar los lineamientos de marca de las licencias
  TEDx.
  `[NECESITA CLARIFICACIÓN: ¿el equipo cuenta con el manual de marca TEDx y sus restricciones de uso del logotipo? Es un requisito de la licencia, no una preferencia estética.]`
- **RF-220:** El sitio DEBE informar la sede y los datos generales del evento.
  `[NECESITA CLARIFICACIÓN: ¿se publicará agenda o programa, y en qué momento?]`

## Entidades clave

- **Evento:** el TEDxUCB. Nombre, lema, fecha y hora, sede, aforo, estado de
  publicación. Alimenta la cuenta atrás.
- **Speaker:** persona confirmada para hablar. Fotografía, nombre, titular,
  reseña, título de charla, orden y estado de publicación.
- **Postulación de speaker:** expresión de interés recibida por el formulario.
  Datos de contacto, idea, evidencia, aplicabilidad, estado de revisión y notas
  internas.
- **Bloque de contenido:** texto editable de las secciones informativas,
  identificado por una clave estable.

## Criterios de éxito

- **CE-201:** El sitio recibe al menos 30 postulaciones de speakers antes de la
  fecha de cierre de convocatoria.
  `[NECESITA CLARIFICACIÓN: ¿cuál es la meta real de postulaciones y la fecha de cierre?]`
- **CE-202:** Al menos el 70% de las postulaciones recibidas plantea una idea
  conceptual con evidencia, y no una anécdota personal o un mensaje
  motivacional. Es la medida directa de si el formulario filtra bien.
- **CE-203:** Un visitante que llega por primera vez identifica la fecha del
  evento y la temática en menos de 30 segundos.
- **CE-204:** El administrador publica un speaker nuevo en menos de 3 minutos,
  sin ayuda técnica.
- **CE-205:** El sitio carga su contenido principal en menos de 3 segundos en
  una conexión móvil promedio.

## Checklist de completitud

- [ ] No quedan marcadores `[NECESITA CLARIFICACIÓN]` — **5 abiertos**
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] No hay detalles de implementación
- [x] Cada historia de usuario es probable de forma independiente
- [x] No hay features especulativas
- [x] Alcance delimitado con claridad
