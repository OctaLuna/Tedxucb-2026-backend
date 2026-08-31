# Contrato: Usuarios, roles y revisión de registros

**Feature:** `001-identidad-y-usuarios`
**Requisitos que satisface:** RF-101 a RF-104a, RF-106, RF-112a, RF-117 a
RF-119, RF-125, RF-126

> Índice de endpoints con su autorización y modos de fallo principales. El
> contrato línea por línea se termina de redactar en `001-b` si hace falta
> más detalle del que da esta tabla.

---

Todos los endpoints de este contrato exigen rol `ADMIN`, salvo donde se
indique lo contrario. Ninguno responde con `password_hash` ni con el detalle
de otras cuentas más allá de lo que cada endpoint declara explícitamente.

## `POST /api/v1/users`

Alta de staff/admin (RF-104a — el staff **no** se auto-registra). Crea el
usuario en `status = 'INVITED'`, `registration_source = 'ADMIN_CREATED'`, y
dispara un `auth_tokens` de tipo `INVITATION` (RF-107, ver
`autenticacion-y-sesiones.md`).

| Campo petición | Tipo | Obligatorio |
|---|---|---|
| `fullName` | string | sí |
| `email` | string | sí |
| `roles` | string[] | sí — subconjunto de `ADMIN`/`STAFF` |

Modos de fallo: `409 DUPLICATE_FIELD` (mismo criterio anti-enumeración que el
auto-registro no aplica aquí — el admin sí puede ver que el correo ya existe,
es su propio panel).

## `GET /api/v1/users`, `GET /api/v1/users/:id`

Listado y detalle de cuentas de staff/admin — **no** de alumnos (eso es
`GET /api/v1/students` en `perfil-y-catalogo.md`). Paginado, formato
`{ data, meta: { page, limit, total, totalPages } }`.

## `PATCH /api/v1/users/:id`

Edición de identidad básica (`fullName`) por el admin. No permite cambiar
`email` por esta vía — la corrección de correo tiene su propio flujo (ver
`POST /correction-requests` más abajo), siempre con re-verificación.

## `POST /api/v1/users/:id/disable`, `POST /api/v1/users/:id/enable`

RF-103, RF-118. Deshabilitar preserva íntegro el historial (nunca se borra).

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `LAST_ADMIN_STANDING` | Intento de deshabilitar al único administrador activo (RF-119) — el trigger `no_disable_last_admin` de `data-model.md` lo rechaza a nivel de motor; el servicio traduce la excepción a este código. |

## `POST /api/v1/users/:id/roles`, `DELETE /api/v1/users/:id/roles/:role`

Otorgar/retirar un rol (Historia 4). Retirar el rol de staff no afecta las
validaciones que ya hizo (quedan atribuidas a él, fuera del alcance de esta
feature — ver `003`).

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `LAST_ADMIN_STANDING` | Intento de retirar el rol `ADMIN` al único administrador activo — trigger `no_remove_last_admin_role`. |

## `GET /api/v1/students/pending`

Registros de alumnos en `status = 'PENDING'`, para el panel de monitoreo
(RF-126, caso límite "nunca verifica" — visibiliza cuentas pendientes hace
más de 7 días, CE-107).

## `POST /api/v1/students/:id/approve`, `POST /api/v1/students/:id/reject`

Revisión manual — la barrera antifraude central desde que no existe padrón
institucional (ADR-007, RF-125, RF-126). `reject` exige `reason` obligatorio
(pasa a `audit_log` y queda visible si el alumno reclama).

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `NOT_PENDING_REVIEW` | La cuenta no está en `PENDING` (ya fue revisada, o nunca lo estuvo — p. ej. cuenta de staff). |

## `POST /api/v1/me/correction-requests`

El alumno solicita corregir un campo bloqueado: `studentCode`, `careerId` o
`email` (RF-112a; el correo es el caso resuelto en la sesión de Clarify —
solo el admin lo ejecuta).

| Campo petición | Tipo | Obligatorio |
|---|---|---|
| `field` | string | sí — `studentCode` \| `careerId` \| `email` |
| `newValue` | string | sí |
| `reason` | string | sí |

## `GET /api/v1/correction-requests`, `POST /api/v1/correction-requests/:id/resolve`

El admin revisa las solicitudes pendientes. Resolver una de tipo `email` no
sobrescribe `users.email` directamente: crea un `auth_tokens`
(`type = 'EMAIL_VERIFICATION'`, `new_email` = el valor solicitado) — el
cambio real solo ocurre cuando el alumno verifica el nuevo correo (ver
`verify-email` en `auto-registro-y-verificacion.md`). Resolver una de tipo
`studentCode` o `careerId` aplica el cambio de inmediato (no requiere
re-verificación, son campos internos del sistema, no un identificador de
acceso).

## `GET /api/v1/audit-log`

RF-117. Consulta paginada y filtrable (`entityType`, `actorId`, rango de
fechas). Exclusivo `ADMIN` — es acceso masivo a actividad de todas las
cuentas, la definición misma de dato sensible bajo el Artículo V.
