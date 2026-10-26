# Contrato implementado: identidad compartida y acceso por evento

**Estado:** contrato de implementación local. Los controladores/DTO y el Swagger servido por `/api/docs` son la referencia del transporte; este documento recoge las reglas funcionales que Swagger no expresa por completo. Las verificaciones de Google con cuenta humana y SMTP externo son gates separados del contrato local.

## Convenciones

- Prefijo HTTP: `/api/v1`; JSON salvo upload multipart de avatar. Las rutas privadas reciben `Authorization: Bearer <accessToken>`.
- Los errores de dominio usan `{ statusCode, error, message, details? }`; los códigos listados abajo son estables para que ambos frontends puedan reaccionar sin interpretar texto.
- Las identidades, apodos y roles pertenecen a la cuenta global. Grants, datos operativos, puntos, selección y contenido privado se resuelven con evento. Los slugs soportados son `tedxucb` e `innovation-week`; los UUID se resuelven en el backend.
- La whitelist solo autoriza un correo para uno o más eventos. No crea una cuenta ni concede roles. El correo se normaliza antes de persistirlo.

## Google Identity Services

### `POST /auth/google/challenge`

Sin body. Responde `200 { "nonce": "..." }`. El backend almacena el nonce de un uso por 300 segundos; límite 30 solicitudes por minuto.

### `POST /auth/google`

Body: `{ "credential": "<Google ID token>", "nonce": "<challenge>" }`. Responde `200` con `accessToken`, `refreshToken`, `expiresIn` y `user` (`id`, `email`, `fullName`, `nickname`, `nicknameRequired`, `roles`, `status`). El access token dura 900 segundos según configuración local actual; el cliente renueva mediante el endpoint de refresh existente.

El backend verifica firma, issuer, audience, expiración, `sub`, `email_verified` y nonce de un solo uso con `google-auth-library`. Para `@ucb.edu.bo` exige `hd=ucb.edu.bo`. Gmail puede acreditar su propia dirección; otro dominio con `hd` coincidente se acepta como autoridad Google; el resto debe haber completado el desafío de titularidad externa. Una cuenta externa también requiere whitelist activa para al menos un evento, salvo una dirección de `ADMIN_EMAILS`. La allowlist administrativa se lee solo en el servidor y concede `ADMIN` más acceso a ambos eventos de forma idempotente y transaccional. Cuentas `PENDING`, `REJECTED`, `INVITED` y `DISABLED` no reciben sesión; Google no las reactiva.

Errores principales: `401 INVALID_GOOGLE_CREDENTIAL`, `401 INVALID_GOOGLE_CHALLENGE`, `403 EMAIL_OWNERSHIP_REQUIRED`, `403 EMAIL_NOT_AUTHORIZED`, `403 ACCOUNT_NOT_ACTIVE`, `409 IDENTITY_CONFLICT`, `429 TOO_MANY_REQUESTS`, `503 GOOGLE_AUTH_UNAVAILABLE`.

### Titularidad de correo externo

- `POST /auth/google/email-verification/request`: body anterior más `eventSlug`. Verifica la credencial y consume el nonce; exige whitelist activa para el evento. Envía un token aleatorio de un uso, persistido como hash y válido tres días. No emite sesión. Resultado `SENT`, `DELIVERY_FAILED` o `ALREADY_VERIFIED`.
- `POST /auth/google/email-verification/confirm`: `{ "token": "..." }`. Consume el enlace una vez y acredita el par `Google sub + correo`; la persona inicia sesión Google otra vez para recibir sesión.
- `POST /auth/identity-invitations/consume`: `{ "token": "..." }`. Confirma que una invitación de tres días sigue vigente y que el scope de ese mismo evento continúa autorizado. No crea usuario, scope ni sesión.

Las rutas de solicitud, confirmación y consumo tienen límites independientes. No hay endpoint de reenvío. El fallo SMTP se devuelve al administrador sin revertir whitelist ni guardar tokens en claro.

## Perfil e identidad

### `GET /me`

Bearer requerido. Devuelve el usuario autenticado (`id`, `email`, `fullName`, `roles`, `status`, `nickname`). Nunca acepta un `userId` suministrado por el cliente. Puede consultarse durante el onboarding aunque aún falte apodo.

### `PATCH /me/nickname`

Bearer requerido. Body `{ "nickname": "Luna27" }`; respuesta `200 { "nickname": "Luna27" }`. Se normaliza con NFKC y se guarda una clave canónica global insensible a mayúsculas. Se admiten de 3 a 24 letras o números Unicode; se rechazan espacios, símbolos y controles. El índice único PostgreSQL resuelve carreras. Errores: `400 INVALID_NICKNAME`, `409 NICKNAME_TAKEN`, `403 ACCOUNT_NOT_ACTIVE`.

### `GET /me/events`

Bearer requerido, incluida una cuenta en onboarding. Devuelve `{ "data": [{ "id", "slug", "name", ... }] }` solo para la identidad activa: un Workspace UCB verificado recibe los dos eventos base; cuentas externas reciben únicamente sus grants no revocados. Cuenta inexistente/inactiva: `403 ACCOUNT_NOT_ACTIVE`.

## Administración de acceso por evento

Las tres rutas requieren `ADMIN` activo en la base; un rol incluido en un JWT viejo no basta. Un administrador solo opera dentro de sus propios eventos.

- `GET /admin/event-access?page=1&limit=20&email=&status=active`: devuelve `{ data, meta }`; busca correo normalizado y pagina grupos de correo completos, con todos sus eventos visibles para el actor. `status` admite `active`, `revoked` y `all`; `limit` máximo 100.
- `POST /admin/event-access`: `{ "email": "persona@example.com", "eventIds": ["<uuid>"] }`. `eventIds` puede omitirse para seleccionar todos los eventos que administra el actor (ambos cuando administra ambos). Reemplaza atómicamente el conjunto dentro del scope del actor; no afecta grants fuera de ese scope. Repetir la misma operación es idempotente. No acepta rol ni crea cuenta.
- `DELETE /admin/event-access/:id`: revoca un grant dentro del scope del administrador; responde `204`.
- `POST /admin/identity-invitations`: `{ "email": "persona@example.com", "eventSlug": "innovation-week" }`. Requiere whitelist ya activa para ese correo/evento y scope ADMIN. Envía el enlace al origen configurado del evento y responde con `SENT` o `DELIVERY_FAILED` y vencimiento. La invitación no concede autorización.

Otros errores: `401 UNAUTHENTICATED`, `403 FORBIDDEN`/`EVENT_ACCESS_DENIED`, `404 EVENT_NOT_FOUND`/`NOT_FOUND`, `429 TOO_MANY_REQUESTS`, `503 FRONTEND_URL_UNAVAILABLE`.

## Contexto de evento y recursos

- Lecturas públicas reciben el slug registrado, por ejemplo `/public/event?slug=tedxucb`, `/public/speakers?eventSlug=innovation-week`, `/public/program?eventSlug=tedxucb` y `/public/live?eventSlug=innovation-week`.
- Las rutas privadas de actividades, perfiles operativos, puntos, ranking, postulaciones, programa/En Vivo, selección y entradas validan sesión, estado, rol y permiso del evento en guard/servicio. Los recursos identificados por UUID vuelven a comprobar que su evento pertenece al actor; no se confía en ocultar botones en la UI.
- Las constraints compuestas y triggers impiden relacionar filas de eventos distintos. El ledger histórico no se reescribe: la propiedad por evento se conserva en su tabla lateral y la proyección de puntos es por evento.

## Avatar 2D opcional

- `GET /me/avatar-session` emite un token puente HS256 de 90 segundos con issuer `tedx-ucb-backend`, audience `avatar-2d`, subject de usuario, scope `avatar:claim` y `jti`.
- `POST /me/avatar-session/revocation-token` emite el scope `avatar:revoke`. El servicio Avatar 2D valida firma, claims, expiración y replay, vincula el draft invitado al usuario y permite revocar sesiones. El cliente no puede asignar propiedad con un `avatarId` o mensaje de iframe.
- El editor y la personalización son opcionales; una falla del servicio no impide continuar el registro.

## Auditoría y release

La excepción de auditoría funcional para vínculo Google, whitelist, invitación y cambio de scope está registrada en [ADR-010](../../../docs/decisiones/ADR-010-identidad-compartida-y-auditoria-temporal.md). No elimina auditoría de otros módulos y sigue siendo gate constitucional antes del release. No aplicar migraciones a Supabase productivo desde este runbook.

La matriz requisito→código→prueba y su estado por gate están en [trazabilidad-requisitos.md](../trazabilidad-requisitos.md). Las rutas desplegadas se contrastan contra Swagger local; el flujo real OAuth y SMTP externo requieren sus credenciales/entorno y no se consideran demostrados por fixtures.
