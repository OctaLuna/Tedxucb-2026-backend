# Contrato: Autenticación y sesiones

**Feature:** `001-identidad-y-usuarios`
**Requisitos que satisface:** RF-107, RF-108, RF-109
**Relacionado:** `auto-registro-y-verificacion.md` (mismo mecanismo de token
de un solo uso, distinto disparador)

> Índice de endpoints con su autorización y modos de fallo principales. El
> contrato línea por línea (ejemplos completos de request/response) se
> termina de redactar en `001-b` si hace falta más detalle del que da esta
> tabla — mismo criterio que `points-and-claims.md` usó en `003`.

---

## `POST /api/v1/auth/login`

Correo + contraseña → par de tokens (RF-109).

**Autorización:** ninguna (público). Rate limit propio, distinto del de
`register` — este endpoint recibe fuerza bruta, no altas masivas.

| Campo petición | Tipo | Obligatorio |
|---|---|---|
| `email` | string | sí |
| `password` | string | sí |

Respuesta `200`: `{ accessToken, refreshToken, expiresIn, user: { id, fullName, roles, status } }`.

| Código | `error` | Cuándo |
|---|---|---|
| `401` | `INVALID_CREDENTIALS` | Correo o contraseña incorrectos. Mensaje idéntico en ambos casos — no revela cuál de los dos falló (anti-enumeración). |
| `403` | `ACCOUNT_NOT_ACTIVE` | La cuenta existe pero no está `ACTIVE` (`PENDING`, `DISABLED`, `REJECTED`, `INVITED`). `details.status` indica cuál, para que el frontend oriente al usuario (verificar correo, contactar al admin, etc.). |
| `429` | `TOO_MANY_REQUESTS` | Límite de intentos superado para el origen o la cuenta. |

## `POST /api/v1/auth/refresh`

Rota el refresh token. **Reutilizar uno ya rotado revoca toda la familia de
tokens del usuario** (skill `seguridad-y-roles`) — señal de que alguien más
tiene una copia.

| Código | `error` | Cuándo |
|---|---|---|
| `401` | `INVALID_REFRESH_TOKEN` | Token inexistente, vencido, o ya rotado (reuso detectado — además dispara la revocación de familia y una entrada en `audit_log`). |

## `POST /api/v1/auth/logout`

Revoca la sesión actual (el refresh token presentado). `204 No Content`.

## `POST /api/v1/auth/logout-all`

Revoca **todas** las sesiones activas del usuario autenticado — para el caso
de sospecha de cuenta comprometida. `204 No Content`.

## `POST /api/v1/auth/accept-invitation`

Consume un `auth_tokens` de tipo `INVITATION` (Historia 1b): define la
contraseña y activa la cuenta de staff/admin dada de alta por el
administrador.

| Campo petición | Tipo | Obligatorio |
|---|---|---|
| `token` | string | sí |
| `password` | string | sí — mismo mínimo que en el registro |

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `INVALID_TOKEN` | No corresponde a ninguna invitación pendiente. |
| `410` | `EXPIRED_TOKEN` | Invitación vencida (Historia 2, escenario 4) — el mensaje indica cómo pedir una nueva al admin. |

Efecto: `users.status` pasa de `INVITED` a `ACTIVE`, `password_hash` queda
fijado, `auth_tokens.consumed_at` se marca. Mismas garantías transaccionales
e idempotencia que `verify-email` en `auto-registro-y-verificacion.md`.

## `POST /api/v1/auth/password-reset/request`

Público. Emite un `auth_tokens` de tipo `PASSWORD_RESET` **sin revelar si el
correo existe** — misma lógica anti-enumeración que el registro: responde
siempre `202 Accepted` con un mensaje genérico ("si el correo existe, se
envió un enlace"), exista o no la cuenta. Rate limit propio (recibe abuso de
spam de correos, no fuerza bruta ni altas masivas).

## `POST /api/v1/auth/password-reset/confirm`

| Campo petición | Tipo | Obligatorio |
|---|---|---|
| `token` | string | sí |
| `newPassword` | string | sí |

Consume el token, actualiza `password_hash`. Efecto adicional: dispara
`logout-all` implícito (revoca todas las sesiones existentes) — si alguien
pidió la recuperación porque su contraseña estaba comprometida, las sesiones
abiertas con la contraseña vieja no deben sobrevivir.

Modos de fallo: mismos `INVALID_TOKEN`/`EXPIRED_TOKEN` que el resto de
`auth_tokens`.

## `GET /api/v1/me`

Identidad básica de la sesión actual: `{ id, email, fullName, roles, status }`.
Base para que el frontend decida qué menús mostrar — relevante para Historia
4 (roles múltiples).

**Autorización:** cualquier usuario autenticado, sobre sí mismo. Nunca acepta
un id — es siempre "quien está autenticado ahora", no una consulta
parametrizable (skill `seguridad-y-roles`: rutas `/me/*`, nunca
`/users/:id/*` para autoconsulta).
