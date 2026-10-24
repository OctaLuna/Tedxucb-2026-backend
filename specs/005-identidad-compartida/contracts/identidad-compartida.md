# Contrato de identidad compartida — borrador de diseño

**Estado:** OAuth y autorizaciones siguen en diseño. El endpoint de apodo está implementado y probado localmente; el resto de rutas propuestas aún no está disponible.

## Convenciones existentes

Prefijo `/api/v1`; JSON; error uniforme `{statusCode,error,message,details?}`; UUID para recursos; fechas ISO UTC; autenticación por `Authorization: Bearer <accessToken>`. Las rutas existentes `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me` conservan contrato hasta aprobar migración compatible.

## Sesión Google — propuesta

El flujo debe elegir entre code flow backend callback o ID token validado por API. No definir todavía un `POST /auth/google` definitivo: payload, endpoint y respuesta dependen de OAuth, redirect, CSRF/state y sesión de dos dominios. El frontend no envía email como prueba ni recibe/almacena client secret. Google `sub` es identificador de proveedor; verificar iss, aud, exp, firma, nonce/state y `hd` Workspace cuando aplique.

**Resultado esperado**: sesión de backend emitida únicamente tras credencial válida y permiso para contexto solicitado. El usuario se crea o se vincula una vez; no se asignan roles por provider claims. Respuesta debe incluir la cuenta mínima (`id`, `email`, `fullName`, `nickname`, `roles`, `status`) y estado de incorporación (`nicknameRequired`, perfil incompleto por evento, eventos accesibles). Campos finales requieren DTO y ejemplo OpenAPI después de fijar elegibilidad y titularidad externas.

**Fallos que deben tener códigos estables**: credencial inválida/vencida, issuer/audience/nonce inválidos, correo no verificado, Workspace no válido, externo sin whitelist, dominio externo cuya titularidad no se pudo probar, usuario disabled, estado de cuenta no elegible, vínculo conflictivo, throttle, proveedor/base no disponible.

## Perfil propio

### `GET /api/v1/me`

Sesión válida. Añadir `nickname` (nullable antes de completar), `nicknameRequired`, `events` o referencia equivalente y completar OpenAPI para la respuesta existente. No exponer el Google token ni detalles de identidad del proveedor.

### `PATCH /api/v1/me/nickname` (propuesta)

Bearer requerido; aplica al usuario autenticado, sin aceptar `userId`.

```json
{ "nickname": "Luna27" }
```

Reglas: entre 3 y 24 caracteres normalizados, letras/números Unicode, sin símbolos, espacios o caracteres de control; normalización NFKC e insensible a mayúsculas; único globalmente comparado con clave canónica. El máximo de 24 es la decisión técnica adoptada para la implementación inicial.

Respuesta propuesta `200`:

```json
{ "nickname": "Luna27", "nicknameKey": "luna27" }
```

`nicknameKey` puede omitirse en respuesta pública si no ayuda al cliente. Errores mínimos: `400 INVALID_NICKNAME`, `409 NICKNAME_TAKEN`, `401 UNAUTHENTICATED`. Concurrencia se resuelve mediante índice único, no preconsulta.

## Eventos visibles y autorización

### `GET /api/v1/me/events` (propuesta)

Bearer; devuelve solo eventos habilitados para la cuenta y estado actual. Cada respuesta tiene `id`, slug público estable acordado, nombre y permisos funcionales del participante. No revela a qué otros eventos tiene acceso otro usuario.

### Recursos del evento

Los endpoints de contenido y actividades deberán expresar el evento con una ruta como `/api/v1/events/:eventId/activities` o resolver un slug público registrado del lado del servidor. Se elige una sola convención y se aplica consistentemente. Guard/servicio valida sesión, estado de cuenta, permiso de evento y rol/relación específica requerida. Nunca se confía en `eventId` elegido por el cliente sin autorización. Errores: `401 UNAUTHENTICATED`, `403 EVENT_ACCESS_DENIED`, `404 NOT_FOUND` cuando revelar existencia no es apropiado.

## Whitelist administrativa — propuesta

ADMIN activo con acceso al evento solicitado. Las rutas exactas se fijan tras revisar convención y paginación actuales. Operaciones necesarias: listar; crear/actualizar autorización; seleccionar uno o ambos eventos (default ambos en una nueva autorización); revocar/reabrir; emitir email de invitación para un correo ya autorizado; consultar estado y vencimiento del enlace si es necesario para el operador.

Contrato de implementación inicial: `GET /admin/event-access?page=1&limit=20&email=&status=active` devuelve `{data: [...], meta: {page, limit, total, totalPages}}` con permisos y eventos. La búsqueda por correo no distingue mayúsculas y pagina grupos de correos, de modo que todos los scopes de una dirección aparecen juntos; `status` acepta `active`, `revoked` o `all` y `limit` está acotado a 100. `POST /admin/event-access` sustituye atómicamente el conjunto de eventos autorizados para el correo y devuelve las filas activas; `DELETE /admin/event-access/:id` revoca una fila y responde 204. Omitir `eventIds` selecciona TEDxUCB e Innovation Week por sus slugs estables; si no están configurados ambos se responde error de configuración en lugar de autorizar un conjunto incompleto. El servidor consulta el rol y estado actual del administrador, incluso si un JWT anterior todavía los incluye.

Forma de alta propuesta:

```json
{
  "email": "persona@ejemplo.com",
  "eventIds": ["<uuid-evento-a>", "<uuid-evento-b>"],
  "sendInvitation": true
}
```

`eventIds` se valida contra catálogo; omisión significa ambos eventos solo para operación inicial y queda explícita en la respuesta. La dirección se normaliza. No se acepta rol, estado de usuario ni identidad Google en este DTO. `sendInvitation` emite un token aleatorio, almacena hash y entrega email después del commit; expiry tres días, uso único. Si email falla, el acceso autorizado permanece; el endpoint responde de forma que el operador pueda ver el estado del envío sin duplicar la autorización. No hay reenvío controlado en la etapa inicial.

La lista sigue válida hasta revocación manual; el enlace expira a los tres días y no crea autorización. El acceso se concede por whitelist activa y prueba de identidad/email suficientes. La invitación básica no es invitación staff (`/auth/accept-invitation`) y no pide contraseña. Cada token persiste el `eventId` al que apunta el enlace. Consumirlo requiere que siga activo el permiso de ese mismo evento, aunque el correo conserve acceso a otro evento. Si el correo falla, el permiso y el token permanecen para que la organización gestione otro envío manualmente.

Errores: correo inválido `400`; evento desconocido `404/422` según convención; duplicado se convierte en actualización idempotente o `409` según la operación aprobada; no ADMIN `403`; proveedor de correo falla tras commit con estado explícito; exceso de uso `429`.

## Invitación externa

Emitir una invitacion exige que quien la solicita sea ADMIN activo y conserve acceso al evento destino; la whitelist activa del destinatario se valida por separado. El enlace usa el origen configurado para el evento, lleva un token aleatorio guardado como hash y vence en tres días. El token es de un solo uso y no concede sesión ni permiso; al consumirlo el backend comprueba el mismo scope activo de la whitelist. No existe endpoint de reenvío. La invitación tampoco verifica titularidad por sí sola: el login Google valida firma, audience, expiración, `email_verified` y nonce de un solo uso. Correos `@ucb.edu.bo` requieren `hd=ucb.edu.bo`; Gmail se considera autoridad sobre su dirección; otros dominios requieren un enlace de verificación de tres días ligado a `subject` y correo antes de recibir sesión.

## Flujo avatar 2D

`avatar-integration-contract` valida protocolo de iframe y referencia visual, pero hoy `avatar-2d` usa bearer anónimo. Las operaciones para vincular referencia con `userId`, recuperar/cambiar dueño, migrar guest o almacenar credenciales no forman parte del contrato presente. Se mantienen como gate de despliegue. Continuar sin avatar no requiere endpoint del proveedor.

## Cambios OpenAPI

Cada endpoint nuevo requiere DTO con decoradores/metadata, respuestas nominales, ejemplos de éxito, código y error, `@ApiBearerAuth` y descripción de scope. Swagger no debe publicar claims inventados ni respuestas genéricas. El spec exacto se actualiza junto con pruebas aprobadas y código.
