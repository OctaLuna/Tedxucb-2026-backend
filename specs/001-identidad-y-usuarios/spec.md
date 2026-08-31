# Especificación: Identidad, usuarios y perfiles

**Rama/ID:** `001-identidad-y-usuarios`
**Estado:** Borrador — pendiente de clarificación
**Entrada:** "Necesito crear perfiles para los alumnos donde cada uno tenga su avatar, y también las actividades que realizaron. También un perfil de monitoreo donde vea el progreso de todos los alumnos, pueda crear el perfil de alumnos. […] aún no pensé los perfiles o sea los tipos de usuarios digamos alumnos, los que dan los puntos […] y el que los administra como el admin que es quien crea los perfiles de cada uno para que funcione correctamente"

## Contexto

TEDxUCB necesita identificar a tres tipos de personas: quienes participan y
acumulan méritos, quienes validan esa participación en el terreno, y quienes
organizan todo. Esta feature es la base sobre la que se apoyan las otras tres.

Decisiones tomadas por el responsable del proyecto:

- **2026-08-30 — Administrador y coordinador son un solo rol.** Quien administra
  el sistema es también quien monitorea a los alumnos.
- **2026-08-30 — Los alumnos se registran por su cuenta.** El administrador no
  carga el padrón a mano; existe un formulario público de registro. Esto cambia
  el modelo de confianza del sistema: la puerta de entrada deja de estar
  controlada por la organización, y por eso esta feature incorpora un bloque de
  verificación de identidad (RF-122 a RF-127) que antes no era necesario.
- **2026-08-30 — Autenticación con credenciales propias del sistema**, no
  federada con la cuenta institucional.

## Alcance

**Sí cubre:** roles y permisos, auto-registro y verificación de alumnos, alta de
usuarios por el administrador, invitación y activación de cuenta,
autenticación, perfil de alumno con avatar, catálogo académico
(facultades y carreras), panel de monitoreo y auditoría.

**No cubre:** actividades y puntos (`003`), contenido público (`002`),
asignación de cupos (`004`).

---

## Historias de usuario

### Historia 1 — El alumno crea su propia cuenta (Prioridad: P1)

Como **alumno de la UCB**, quiero registrarme por mi cuenta con mis datos para
empezar a participar sin depender de que alguien me dé de alta.

**Por qué esta prioridad:** decisión tomada el 2026-08-30. El auto-registro
elimina el cuello de botella de cargar cientos de alumnos a mano y permite que
la campaña arranque en cuanto el sitio esté publicado.

**Riesgo que introduce, y que esta historia debe cerrar:** si cualquiera puede
crear una cuenta, cualquiera puede acumular puntos, y los puntos deciden quién
ocupa una butaca. Sin un mecanismo de verificación, una persona puede crear
varias cuentas o alguien ajeno a la UCB puede competir por un cupo. **El
auto-registro sin verificación destruye la legitimidad del ranking**, que es lo
único que sostiene todo el sistema. Ver RF-122 a RF-126.

**Prueba independiente:** una persona se registra, queda verificada y accede a
su perfil. Un intento con datos no válidos no obtiene cuenta activa.

**Escenarios de aceptación:**

1. **Dado** un visitante en la página de registro, **Cuando** completa sus datos
   y envía el formulario, **Entonces** su cuenta queda creada en estado
   pendiente de verificación, sin poder acumular puntos todavía.
2. **Dado** una cuenta pendiente, **Cuando** se completa la verificación,
   **Entonces** la cuenta pasa a activa y el alumno puede generar su código y
   participar.
3. **Dado** un código de registro o un correo ya usado, **Cuando** alguien
   intenta registrarse con él, **Entonces** el sistema lo rechaza indicando el
   campo duplicado, sin revelar datos del titular existente.
4. **Dado** un intento de registro con un correo ajeno a la institución,
   **Cuando** se envía, **Entonces** el sistema lo rechaza.
5. **Dado** una cuenta pendiente de verificación, **Cuando** el staff intenta
   registrarle participación, **Entonces** el sistema lo impide.
6. **Dado** un registro incompleto, **Cuando** se envía, **Entonces** el sistema
   indica con precisión qué falta.

### Historia 1b — Alta y control por el administrador (Prioridad: P1)

Como **administrador**, quiero crear cuentas de staff, dar de alta alumnos
manualmente cuando haga falta y supervisar los registros entrantes, para
mantener el control sobre quién está en el sistema.

**Por qué esta prioridad:** el staff no se auto-registra —es un rol de
confianza— y el administrador necesita poder intervenir sobre los registros de
alumnos.

**Prueba independiente:** se crea un miembro de staff que recibe invitación y
activa su cuenta; se revisa y aprueba o rechaza un registro pendiente.

**Escenarios de aceptación:**

1. **Dado** un administrador, **Cuando** crea un miembro de staff, **Entonces**
   este recibe una invitación para definir su contraseña.
2. **Dado** un registro de alumno pendiente, **Cuando** el administrador lo
   revisa, **Entonces** puede aprobarlo o rechazarlo con motivo.
3. **Dado** un padrón institucional en archivo, **Cuando** el administrador lo
   importa, **Entonces** el sistema lo usa como referencia de validación y
   reporta las filas inválidas sin abortar la importación.
4. **Dado** una cuenta sospechosa de ser duplicada, **Cuando** el administrador
   la deshabilita, **Entonces** sale del ranking conservando su historial.

### Historia 2 — El alumno se reconoce en el sistema (Prioridad: P1)

Como **alumno**, quiero acceder a mi perfil con mi avatar y mis datos para
sentir que el sistema me representa y confiar en lo que registra sobre mí.

**Por qué esta prioridad:** el pedido original menciona el avatar
explícitamente. Es lo primero que el alumno ve y determina si percibe la
plataforma como suya o como un trámite.

**Prueba independiente:** un alumno activa su cuenta, entra, sube su foto y ve
sus datos correctos.

**Escenarios de aceptación:**

1. **Dado** un alumno con invitación vigente, **Cuando** define su contraseña,
   **Entonces** su cuenta pasa a activa y accede a su perfil.
2. **Dado** un alumno autenticado, **Cuando** sube una imagen de avatar dentro
   del formato y tamaño admitidos, **Entonces** la imagen queda asociada a su
   perfil y se muestra en todas las vistas donde aparece.
3. **Dado** un alumno que sube un archivo que no es una imagen válida,
   **Cuando** confirma la subida, **Entonces** el sistema lo rechaza sin
   alterar el avatar existente.
4. **Dado** una invitación vencida, **Cuando** el alumno intenta usarla,
   **Entonces** el sistema informa el vencimiento y le indica cómo solicitar
   una nueva.

### Historia 3 — Monitoreo de la comunidad (Prioridad: P2)

Como **administrador**, quiero ver el listado completo de alumnos y el detalle
de cada uno para saber quién está participando y quién no.

**Por qué esta prioridad:** es el "perfil de monitoreo" del pedido original.
Necesario para operar, pero solo cobra sentido cuando ya hay puntos que
observar (feature `003`).

**Prueba independiente:** con alumnos cargados, el administrador filtra por
carrera y abre el detalle de uno.

**Escenarios de aceptación:**

1. **Dado** un administrador autenticado, **Cuando** abre el listado de
   alumnos, **Entonces** ve nombre, carrera, estado y puntaje de cada uno.
2. **Dado** el listado, **Cuando** filtra por carrera, facultad o busca por
   nombre o código, **Entonces** obtiene solo los alumnos coincidentes.
3. **Dado** un miembro de staff autenticado, **Cuando** intenta acceder al
   listado global de alumnos, **Entonces** el sistema se lo deniega.

### Historia 4 — Roles múltiples (Prioridad: P3)

Como **administrador**, quiero poder designar a un alumno como staff de una
actividad sin que pierda su condición de alumno ni su puntaje.

**Por qué esta prioridad:** es un caso real —los voluntarios del evento suelen
ser alumnos destacados— pero no bloquea el arranque.

**Prueba independiente:** se otorga el rol de staff a un alumno existente y
este conserva su perfil, su puntaje y su capacidad de acumular puntos.

**Escenarios de aceptación:**

1. **Dado** un alumno activo, **Cuando** el administrador le añade el rol de
   staff, **Entonces** el alumno conserva su perfil y su puntaje, y además
   accede a las funciones de validación.
2. **Dado** un usuario con dos roles, **Cuando** el administrador le retira
   uno, **Entonces** pierde solo los permisos de ese rol.

---

## Casos límite

- **Alumno que abandona la universidad a mitad del proceso.** Se deshabilita:
  conserva su historial y su puntaje, pero queda excluido del ranking y de la
  asignación de cupos. No se elimina, porque borrarlo rompería la trazabilidad
  de las transacciones que originó.
- **Un miembro de staff se retira del equipo.** Se le retira el rol; las
  validaciones que hizo permanecen íntegras y siguen atribuidas a él.
- **Corrección del correo de un alumno ya activo.** El correo es su
  identificador de acceso; cambiarlo requiere reverificación.
  `[NECESITA CLARIFICACIÓN: ¿puede el alumno cambiar su propio correo, o solo el administrador?]`
- **Alumno que olvida su contraseña.** Recuperación por correo con enlace de un
  solo uso y vencimiento.
- **Último administrador del sistema.** El sistema debe impedir que se
  deshabilite o se le retire el rol al único administrador activo, para no
  dejar la instalación sin acceso.
- **Dos alumnos con el mismo nombre completo.** Frecuente en una universidad.
  El código de registro es el discriminador y debe mostrarse siempre junto al
  nombre en las vistas de validación.
- **Una persona se registra dos veces con dos correos institucionales
  distintos.** Escenario real de fraude: dos cuentas acumulando puntos por
  separado para duplicar la probabilidad de cupo. El código de registro único es
  la primera barrera; el padrón institucional, la segunda. Si no hay padrón,
  esta puerta queda abierta y el administrador debe revisar los registros.
- **Alguien ajeno a la UCB se registra con un correo institucional prestado.**
  La verificación por correo no lo detecta. Solo el cruce contra el padrón o la
  verificación del documento en la puerta lo hacen.
- **Un alumno declara una carrera que no es la suya** para figurar en un reporte
  de distribución distinto. Con ranking puro no afecta la selección, pero sí
  distorsiona los datos. Por eso la carrera queda bloqueada tras la
  verificación.
- **Un alumno se registra pero nunca verifica su correo.** Su cuenta queda
  pendiente indefinidamente y no acumula puntos. Debe visibilizarse en el panel:
  probablemente sea alguien que quiso participar y se topó con un correo en
  spam.
- **Registro masivo automatizado.** El formulario público es un blanco. Sin
  límite de frecuencia, un script puede llenar la base de cuentas basura.

## Requisitos funcionales

- **RF-101:** El sistema DEBE distinguir tres roles: administrador, staff y
  alumno.
- **RF-102:** El sistema DEBE permitir que un usuario tenga más de un rol
  simultáneamente.
- **RF-103:** Solo el administrador DEBE poder crear, editar y deshabilitar
  usuarios, y asignar o retirar roles.
- **RF-104:** El sistema DEBE permitir que un alumno cree su propia cuenta desde
  un formulario público de registro.
- **RF-104a:** El sistema DEBE permitir además el alta individual de usuarios por
  parte del administrador, obligatoria para el rol de staff. **El staff no se
  auto-registra:** es un rol de confianza que otorga puntos.
- **RF-105:** El administrador DEBE poder importar un padrón institucional que
  el sistema use como referencia de validación, procesando las filas válidas y
  reportando las inválidas con su motivo, sin cancelar la operación.
- **RF-106:** El sistema DEBE identificar unívocamente a cada alumno por su
  código de registro y por su correo, y rechazar duplicados de cualquiera de los
  dos sin revelar datos del titular existente.
- **RF-107:** El sistema DEBE enviar una invitación al crear un usuario desde el
  panel de administración, con la que este define su contraseña.
- **RF-108:** Las invitaciones, los enlaces de verificación y los de recuperación
  DEBEN ser de un solo uso y tener vencimiento.
  `[NECESITA CLARIFICACIÓN: ¿cuántos días de validez?]`
- **RF-109:** El sistema DEBE autenticar a los usuarios con correo y contraseña
  propios del sistema y mantener sesiones revocables. (Decisión tomada el
  2026-08-30: registro autogestionado, no autenticación federada con la cuenta
  institucional.)

### Verificación de identidad — requisito derivado del auto-registro

- **RF-122:** Una cuenta creada por auto-registro DEBE quedar en estado
  pendiente y NO DEBE poder acumular puntos hasta ser verificada.
- **RF-123:** El sistema DEBE restringir el registro a correos del dominio
  institucional de la UCB.
  `[NECESITA CLARIFICACIÓN: ¿cuál es el dominio exacto de los correos de alumnos? ¿Todos los alumnos habilitados tienen uno activo, o hay quienes usan correo personal?]`
- **RF-124:** El sistema DEBE verificar la titularidad del correo mediante un
  enlace de un solo uso antes de activar la cuenta.
- **RF-125:** El sistema DEBE validar el código de registro declarado contra el
  padrón institucional cuando este haya sido cargado, y rechazar los que no
  figuren en él.
  `[NECESITA CLARIFICACIÓN: ¿existe un padrón exportable de alumnos habilitados? Si no lo hay, la única barrera real contra cuentas falsas es el dominio del correo, y conviene decidir si el administrador revisará los registros manualmente.]`
- **RF-126:** El administrador DEBE poder revisar, aprobar, rechazar y
  deshabilitar registros de alumnos, y ver los pendientes de verificación.
- **RF-127:** El formulario de registro DEBE estar protegido contra altas
  automatizadas masivas.

### Perfil del alumno

- **RF-110:** El perfil de alumno DEBE contener los siguientes datos.
  **Obligatorios en el registro** (mínimos para operar y para contactarlo cuando
  gane un cupo):

  | Campo | Para qué sirve |
  |---|---|
  | Nombres y apellidos | Identificación en el check-in y en la puerta |
  | Código de registro / matrícula | Identificador único y validación contra el padrón |
  | Correo institucional | Acceso, verificación y notificación de cupo |
  | Carrera | Filtros del panel y reporte de distribución (RF-407a) |
  | Semestre o año en curso | Segmentar la comunicación |
  | Teléfono de contacto | Avisar de un cupo cuando el correo no se lee a tiempo |
  | Contraseña | Acceso |

  **Opcionales, completables después:**

  | Campo | Para qué sirve |
  |---|---|
  | Avatar | Confirmación visual en el check-in; apropiación del perfil |
  | Documento de identidad | Verificación en la puerta el día del evento |
  | Biografía breve | Perfil de la comunidad |
  | Áreas de interés temático | Medir la diversidad disciplinar de los asistentes |
  | Requerimientos de accesibilidad | Preparar la sede con antelación |
  | Restricciones alimentarias | Solo si habrá servicio de alimentos |
  | Enlace a red profesional | Vinculación posterior al evento |

  `[NECESITA CLARIFICACIÓN: ¿habrá servicio de alimentos en el evento? Si no, el campo de restricciones alimentarias sobra y conviene quitarlo: cada campo extra baja la tasa de registros completados.]`

- **RF-110a:** El formulario de registro NO DEBE pedir campos opcionales. Se
  solicitan después, desde el perfil ya creado. Un formulario largo es la causa
  más común de abandono en el registro.
- **RF-111:** El alumno DEBE poder subir y reemplazar su avatar; el sistema DEBE
  validar formato y tamaño y rechazar lo que no cumpla.
- **RF-112:** El alumno DEBE poder editar sus datos de contacto, su biografía,
  su avatar y sus campos opcionales. **NO DEBE** poder editar su código de
  registro ni su carrera una vez verificados: son la base de la validación y del
  reporte de distribución.
- **RF-112a:** El alumno DEBE poder solicitar al administrador la corrección de
  un campo bloqueado.
- **RF-128:** El sistema DEBE recabar el consentimiento explícito del alumno para
  el tratamiento de sus datos personales y para el uso de su imagen en el
  registro fotográfico del evento.
  `[NECESITA CLARIFICACIÓN: ¿la universidad tiene un texto de consentimiento aprobado que debamos usar? Es un requisito legal, no una casilla decorativa.]`
- **RF-113:** El administrador DEBE poder listar a todos los alumnos con su
  estado y puntaje, filtrando por carrera, facultad, estado y texto libre.
- **RF-114:** El administrador DEBE poder abrir el detalle de progreso
  individual de cualquier alumno.
- **RF-115:** El staff NO DEBE poder acceder al listado global de alumnos ni al
  ranking.
- **RF-116:** El sistema DEBE mantener un catálogo de facultades y carreras
  gestionable por el administrador.
- **RF-117:** El sistema DEBE registrar en auditoría toda alta, edición,
  deshabilitación de usuario y cambio de rol, con autor, momento y detalle.
- **RF-118:** Deshabilitar un usuario DEBE preservar íntegro su historial y sus
  registros asociados.
- **RF-119:** El sistema DEBE impedir que quede sin ningún administrador activo.
- **RF-120:** El sistema DEBE permitir exportar el padrón de alumnos y su estado
  en un formato tabular abierto.
- **RF-121:** El sistema DEBE contemplar la eliminación o anonimización de los
  datos personales de los alumnos una vez concluido el evento.
  `[NECESITA CLARIFICACIÓN: ¿qué plazo de retención define la universidad tras el 9 de noviembre? ¿Los puntos se conservan para futuras ediciones o el sistema se archiva?]`

## Entidades clave

- **Usuario:** persona con acceso al sistema. Tiene identidad (nombre, correo),
  estado (invitado, activo, deshabilitado) y uno o más roles.
- **Rol:** conjunto de permisos. Tres valores posibles: administrador, staff,
  alumno.
- **Perfil de alumno:** información extendida que solo aplica a quienes
  participan y acumulan puntos. Relación uno a uno con Usuario.
- **Facultad y Carrera:** estructura académica de la UCB. Una carrera pertenece
  a una facultad; un alumno pertenece a una carrera.
- **Invitación:** permiso temporal y de un solo uso para activar una cuenta.
- **Registro de auditoría:** constancia inmutable de quién hizo qué y cuándo.

## Criterios de éxito

- **CE-101:** Un alumno completa su registro en menos de 3 minutos y sin
  asistencia.
- **CE-102:** Al menos el 85% de quienes inician el registro lo completa y
  verifica su correo. Una cifra baja indica que el formulario pide demasiado o
  que el correo de verificación no está llegando.
- **CE-103:** Al menos el 70% de los alumnos activos sube un avatar propio.
- **CE-104:** Cero incidentes de acceso a datos de alumnos por parte de usuarios
  sin el rol correspondiente durante toda la operación del evento.
- **CE-105:** El administrador localiza a un alumno concreto en el panel en
  menos de 10 segundos.
- **CE-106:** Cero cuentas duplicadas de una misma persona detectadas al cierre
  del ranking. Es la medida directa de si la verificación funciona.
- **CE-107:** Menos del 2% de las cuentas queda en estado pendiente de
  verificación más de 7 días.

## Checklist de completitud

- [ ] No quedan marcadores `[NECESITA CLARIFICACIÓN]` — **8 abiertos** (3 resueltos, 6 nuevos derivados del auto-registro)
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] No hay detalles de implementación
- [x] Cada historia de usuario es probable de forma independiente
- [x] No hay features especulativas
- [x] Alcance delimitado con claridad
