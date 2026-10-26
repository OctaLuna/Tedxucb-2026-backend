# Identidad compartida y acceso por evento

**Estado:** integración funcional implementada y desplegada en piloto aislado (`release-20261026-v2`). La suite local, los contratos y el arranque del stack remoto pasaron. La aceptación pública sigue pendiente de DNS/TLS, login Google en los orígenes finales, SMTP externo y los gates de release documentados en `tasks.md` y `plan-deploy-servidor-aislado.md`.
**Decisiones registradas:** 2026-10-22 y 2026-10-23. Esta feature amplía la identidad de `001` y enmienda para el nuevo flujo la decisión de usar únicamente credenciales propias.

## Problema y alcance

TEDxUCB y la Semana de la Facultad necesitan reconocer a la misma persona con una cuenta y un apodo únicos compartidos. Cada evento decide por separado a qué participantes permite entrar y mantiene aislados sus contenidos, actividades, puntajes, rankings y operaciones. La primera experiencia a integrar es «Registrate» de Innovation Week.

El acceso se inicia directamente con Google y el servidor del backend toma la decisión de identidad y permiso. Firebase se elimina de esta experiencia. Tras autenticarse, la persona elige el apodo compartido si todavía no lo tiene. Puede crear un avatar 2D o continuar sin personalizarlo. La autorización y titularidad del avatar 2D están implementadas mediante el bridge servicio-a-servicio; la aceptación iframe/origen público queda pendiente de los dominios finales.

Incluye cuenta federada, vinculación segura de cuentas existentes, apodo único, lista de autorizaciones por correo y evento, invitación básica por correo con vencimiento de tres días, sesión del backend, primera integración del frontend y base modular para separar ambos eventos.

No incluye sincronizar el libro de puntos, ranking, asistencia, avatares 3D o contenido de los eventos; diseñar una invitación con aceptación, reenvío o seguimiento; administración avanzada de auditoría; ni configuración final de OAuth en producción.

## Actores y reglas

- **Persona participante:** se autentica con Google, completa el apodo y accede únicamente a los eventos autorizados.
- **Administrador:** agrega, consulta, cambia o revoca autorizaciones por evento; puede invitar por correo. La interfaz de administración refleja las operaciones del servidor.
- **Cuenta de Google:** el identificador estable de la identidad es el `sub` verificado por Google, nunca un valor de perfil enviado por el navegador.
- **Evento:** TEDxUCB e Innovation Week tienen identidad de evento propia, permisos y datos separados.

### Requisitos funcionales

- **RF-501:** el backend DEBE verificar firma, emisor, audiencia, vigencia e identificador de la credencial Google antes de resolver una cuenta.
- **RF-502:** el acceso institucional automático DEBE limitarse al dominio exacto `ucb.edu.bo` y a una cuenta de Google Workspace acreditada para ese dominio; no basta comparar el sufijo del email.
- **RF-503:** una dirección externa DEBE tener autorización activa para el evento al que intenta acceder. La configuración inicial de autorización selecciona ambos eventos; el administrador puede elegir uno o ambos.
- **RF-504:** cada autorización DEBE ser para un correo normalizado concreto, sin conceder roles administrativos por defecto.
- **RF-505:** la invitación básica DEBE enviarse por correo y vencer a los tres días. Reenviar invitaciones, rastrear aperturas o crear un flujo de aceptación son funciones fuera del alcance inicial. El correo de invitación no concede acceso: la dirección debe estar previamente en la lista permitida.
- **RF-506:** el correo compartido por una invitación DEBE acreditar que la persona controla la cuenta de Google utilizada. El manejo seguro de correos externos para los cuales Google no es autoridad suficiente debe quedar resuelto en el contrato antes de habilitar la vinculación.
- **RF-507:** una identidad Google verificada DEBE vincularse automáticamente a la cuenta existente que corresponda, incluidas cuentas `PENDING`, `REJECTED` e `INVITED`, conservando estado, historial y roles. Esos tres estados permanecen bloqueados hasta cumplir sus controles actuales. Una cuenta `DISABLED` permanece bloqueada y no se reactiva mediante Google.
- **RF-508:** dos accesos simultáneos de la misma identidad o correo no DEBEN crear cuentas duplicadas, asociaciones repetidas ni privilegios extra.
- **RF-509:** la cuenta DEBE tener un apodo global único compartido por los dos frontends. Si no tiene apodo, no puede continuar a la experiencia autenticada hasta elegir uno disponible.
- **RF-510:** el apodo DEBE contener de 3 a 24 caracteres y usar únicamente letras y números, incluidas letras Unicode. Símbolos, espacios y controles se rechazan. La comparación normaliza Unicode y no distingue mayúsculas; una clave canónica persistida tiene restricción única en PostgreSQL.
- **RF-511:** la personalización de avatar 2D DEBE ser opcional; omitirla permite continuar. La interfaz actual no puede asignar un avatar por recibir un mensaje del iframe o un `avatarId` sin autorización del servicio propietario.
- **RF-512:** el servidor DEBE comprobar permiso de evento en toda ruta que lea o modifique un recurso cuyo alcance sea de evento; ocultar una opción en la UI no constituye autorización.
- **RF-513:** las entidades y restricciones del dominio de eventos DEBEN permitir coexistencia de múltiples eventos sin colisiones de IDs locales, nombres globales ni índices que supongan un único evento publicado.
- **RF-514:** en la primera etapa no se añaden eventos de auditoría para acciones nuevas de esta feature (vínculo Google, whitelist, invitación y cambios de alcance). Esta excepción temporal se limita a esta funcionalidad y se registra como desviación que requiere enmienda de la constitución o decisión explícita antes del lanzamiento. No se retira auditoría ya implementada fuera de este flujo.
- **RF-515:** el panel administrativo DEBE permitir listar, crear autorización manual, enviar invitación, elegir evento(s), cambiar alcance y revocar acceso, mostrando el estado confirmado por backend.
- **RF-516:** el frontend de Innovation Week DEBE autenticar mediante el backend compartido y retirar Firebase cuando se haya comprobado que ya no quedan consumidores.
- **RF-517:** el backend DEBE mantener una allowlist privada `ADMIN_EMAILS`; al autenticar por Google una dirección configurada, debe asignarle idempotentemente el rol `ADMIN` y acceso a TEDxUCB e Innovation Week. La lista no se administra desde el frontend, whitelist de participantes ni invitaciones.

### Pruebas de aceptación del producto

1. Una persona UCB entra con Google y, si carece de apodo, elige uno antes de continuar.
2. Un correo externo que no figura en la lista no obtiene sesión útil ni accede a los datos de evento.
3. Una autorización nueva incluye ambos eventos por defecto; seleccionar uno permite el acceso solo a ese evento.
4. El vencimiento del correo de invitación a los tres días no añade una dirección a la whitelist ni habilita acceso. Una autorización manual existente sigue el alcance y vigencia definidos por el administrador.
5. Un apodo usado por otra cuenta se rechaza incluso ante dos solicitudes concurrentes.
6. Cuentas previas conservan identidad y estado al vincular Google; una cuenta deshabilitada no puede acceder.
7. El mismo usuario conserva ID y apodo al entrar por TEDxUCB y por Innovation Week; sus permisos y datos de evento siguen separados.
8. La persona puede guardar un avatar mediante el flujo autorizado del proveedor 2D o continuar sin avatar.
9. Un token vencido, una audiencia incorrecta, una firma inválida, un dominio parecido o una sesión sin permiso de evento no concede acceso.

### Aceptación de la allowlist administrativa (RF-517)

1. El correo incluido en `ADMIN_EMAILS` inicia sesión con un token Google válido y recibe `ADMIN` más ambos eventos; repetir el inicio de sesión no crea roles ni autorizaciones duplicados.
2. Una dirección externa no incluida en la allowlist de administradores sigue sujeta a la whitelist normal y no obtiene `ADMIN` por recibir permiso de participante.
3. La lista solo se carga desde el entorno privado del backend y no aparece en los bundles frontend.

## Decisiones pendientes para aceptación pública

- **Elegibilidad:** falta enumerar los campos de perfil y consentimiento requeridos para participar en cada evento. Autenticarse no equivale a estar habilitado para recibir puntos o competir por cupos.
- **OAuth:** el Client ID Web acordado está configurado para las pruebas locales y en el entorno del piloto. Falta confirmar/añadir los orígenes HTTPS finales en Google Cloud y completar un login humano desde cada dominio una vez que DNS/TLS estén activos. El flujo GIS no requiere client secret ni redirect URI; no se documenta un costo sin consultar las condiciones vigentes del propietario del proyecto.
- **Titularidad externa:** el contrato exige `email_verified`, correo exacto en whitelist y challenge de invitación de un uso con vencimiento a tres días; no se vincula por coincidencia textual solamente. No se implementa un método alternativo a Google para recuperar correo externo.
- **Avatar:** el bridge, ownership y flujo opcional 2D están implementados y probados localmente; falta probarlos desde el origen HTTPS definitivo y verificar persistencia tras recrear el servicio del piloto.
- **Auditoría:** la ausencia temporal de auditoría para cambios de whitelist es excepción al Artículo V de `memory/constitution.md`. Requiere revisión de lanzamiento y enmienda formal antes de producción; los registros existentes y el libro de puntos mantienen sus reglas actuales.

## Fuera de alcance explícito

La invitación inicial no incorpora botones de aceptación, reenvío, tracking, caducidad de whitelist ni soporte a usuarios. La whitelist se mantiene hasta revocación manual. La identidad cuenta es global; los permisos y datos operativos son del evento. Esta etapa prepara el aislamiento y la primera autenticación, pero no conecta puntos, rankings ni actividades en los dos frontends.
