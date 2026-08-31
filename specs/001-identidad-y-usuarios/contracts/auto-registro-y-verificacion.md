# Contrato: Auto-registro y verificación de correo

**Feature:** `001-identidad-y-usuarios`
**Requisitos que satisface:** RF-104, RF-106, RF-108, RF-110, RF-110a,
RF-122 a RF-128
**Criticidad:** máxima. Es la puerta de entrada de todo el sistema y la que
más riesgo de fraude concentra (Historia 1).

> Este contrato se escribe **antes** que la implementación (Artículo IX). Las
> pruebas de contrato derivadas de este documento deben fallar antes de
> existir una sola línea del servicio.

---

## `POST /api/v1/auth/register`

Crea la cuenta de un alumno en estado `PENDING`, sin acumular puntos hasta que
se verifique. No pide ningún campo opcional (RF-110a): esos se completan
después desde el perfil ya creado.

**Autorización:** ninguna (endpoint público). Protegido por límite de
frecuencia (RF-127) — valor inicial sugerido: 5 registros por IP por hora,
configurable por variable de entorno, no un valor fijo en el código.

### Petición

```json
{
  "fullName": "María Fernanda Quispe Aliaga",
  "email": "maria.quispe@ucb.edu.bo",
  "studentCode": "202012345",
  "careerId": "b3f1c2a0-...",
  "academicPeriod": "5to semestre",
  "phone": "+59170012345",
  "password": "unaClaveSegura9",
  "consentVersionId": "c9a27e10-..."
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `fullName` | string | sí | Nombres y apellidos. |
| `email` | string | sí | Debe terminar en `@ucb.edu.bo` (RF-123). |
| `studentCode` | string | sí | Código de registro / matrícula. Único (RF-106). |
| `careerId` | UUID | sí | Debe existir en el catálogo (RF-116). |
| `academicPeriod` | string | sí | Semestre o año en curso, texto libre. |
| `phone` | string | sí | Teléfono de contacto. |
| `password` | string | sí | Mínimo 10 caracteres. Se hashea con Argon2id, nunca se registra en logs. |
| `consentVersionId` | UUID | sí | Debe ser la versión de `consent_versions` **actualmente activa** (RF-128). |

No se aceptan `avatar`, `bio`, `interests`, `accessibilityNeeds`,
`professionalLink` ni `idDocument` en este endpoint (RF-110a): un intento de
enviarlos se ignora, no se rechaza — no vale la pena hacer fallar todo el
registro por un campo que de todas formas se puede completar después.

### Respuesta exitosa — `201 Created`

```json
{
  "userId": "b41d9a12-...",
  "status": "PENDING",
  "email": "maria.quispe@ucb.edu.bo",
  "message": "Revisa tu correo institucional para verificar tu cuenta. El enlace vence en 7 días."
}
```

No se emite ningún token de sesión en esta respuesta: la cuenta no puede
operar hasta verificarse (RF-122), así que no hay sesión que otorgar todavía.

### Modos de fallo

| Código | `error` | Cuándo | Requisito |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Campo faltante o de formato inválido (teléfono sin formato reconocible, contraseña por debajo del mínimo). `details` trae el error por campo. | RF-110, Historia 1 escenario 6 |
| `422` | `EMAIL_DOMAIN_NOT_ALLOWED` | El correo no termina en `@ucb.edu.bo`. Bien formado como correo, pero no admitido. | RF-123, Historia 1 escenario 4 |
| `422` | `INVALID_CAREER` | `careerId` no existe en el catálogo. | RF-116 |
| `410` | `CONSENT_VERSION_OUTDATED` | `consentVersionId` ya no es la versión activa (cambió mientras se llenaba el formulario). `details.currentVersionId` trae la vigente. | RF-128 |
| `409` | `DUPLICATE_FIELD` | El correo o el código de registro ya existen, **en cualquier estado** de la cuenta existente (incluida `REJECTED` o `DISABLED`: ver ADR-007, esos valores no se liberan). `details.field` indica `"email"` o `"studentCode"`, nunca ambos a la vez ni datos del titular. | RF-106, Historia 1 escenario 3 |
| `429` | `TOO_MANY_REQUESTS` | Límite de frecuencia superado para el origen. | RF-127 |

**Qué NO debe revelar el error de duplicado.** El caso más sensible del
contrato. `DUPLICATE_FIELD` indica *qué campo* colisionó, nunca a quién
pertenece la cuenta existente: sin nombre, sin fecha de creación, sin estado.
Si el correo y el código coinciden con cuentas distintas, se reporta el
correo primero (orden determinista, documentado, no un detalle de
implementación accidental).

```json
{
  "statusCode": 409,
  "error": "DUPLICATE_FIELD",
  "message": "Este correo ya está registrado.",
  "details": { "field": "email" }
}
```

### Garantías transaccionales

Todo lo siguiente ocurre dentro de una única transacción de base de datos:

1. Validar formato de los campos obligatorios → `400` si falla, sin tocar la
   base.
2. Validar el dominio del correo → `422` si falla.
3. Validar que `consentVersionId` sigue siendo la versión activa → `410` si
   no.
4. Verificar unicidad de `email` (comparación insensible a mayúsculas vía
   `CITEXT`) contra `users`, sin filtrar por estado → si existe, abortar con
   `409 DUPLICATE_FIELD, field: "email"`.
5. Verificar unicidad de `studentCode` contra `student_profiles`, sin filtrar
   por estado → si existe, abortar con `409 DUPLICATE_FIELD, field:
   "studentCode"`.
6. Insertar en `users` (`status = 'PENDING'`,
   `registration_source = 'SELF_REGISTRATION'`, `password_hash` ya calculado
   con Argon2id).
7. Insertar en `student_profiles` (`career_id`, `academic_period`, `phone`,
   `student_code`).
8. Insertar en `consent_acceptances`.
9. Insertar en `auth_tokens` (`type = 'EMAIL_VERIFICATION'`, `token_hash`,
   `expires_at = now() + 7 días`).
10. Insertar en `audit_log` (`action = 'USER_REGISTERED'`,
    `actor_id` = el propio usuario nuevo).
11. Confirmar.

El correo de verificación se encola **después** de confirmar, nunca dentro de
la transacción: un fallo del servicio de correo no puede impedir que la
cuenta quede creada, ni dejarla en un estado a medias.

**Invariante:** al terminar, existen `users`, `student_profiles`,
`consent_acceptances` y el `auth_tokens` de verificación, todos juntos, o no
existe ninguno.

### Idempotencia y concurrencia — comportamiento exigido

A diferencia del check-in de `003`, este endpoint **no** deriva una clave de
idempotencia del lado del servidor: no hay forma de distinguir de forma
segura "el mismo alumno reintentando tras perder la respuesta" de "un segundo
intento de fraude con el mismo correo". Ambos casos producen el mismo
resultado observable, y es el correcto:

| Escenario | Resultado |
|---|---|
| Primera petición con datos válidos y sin duplicados | `201` |
| Reintento genuino tras caída de red (mismo correo/código, ya creado) | `409 DUPLICATE_FIELD` — el cliente no debe reintentar automáticamente tras un `201`; si el usuario ve una pantalla de error tras un reintento manual, el mensaje de `DUPLICATE_FIELD` ya lo orienta a "iniciar sesión o verificar tu correo" en vez de reintentar el registro |
| Dos peticiones concurrentes con el mismo correo y/o código | Una `201`, la otra `409 DUPLICATE_FIELD`. Nunca dos `201`. Lo garantiza la restricción única de `users.email` (`CITEXT`) y `student_profiles.student_code`, no una verificación previa en el servicio |
| Dos peticiones concurrentes con datos distintos | Dos `201` normales |

El tercer caso solo puede probarse con base de datos real y peticiones
verdaderamente simultáneas (Artículo IX).

---

## `POST /api/v1/auth/verify-email`

Consume el token de verificación y activa la cuenta. El enlace del correo
apunta a una página del frontend, que es quien llama a este endpoint con el
token — nunca se resuelve la verificación con un `GET` directo a la API, para
no dejar el token en logs de acceso ni en el header `Referer`.

**Autorización:** ninguna (endpoint público; la prueba de identidad es el
token mismo).

### Petición

```json
{ "token": "3f9a1c7e8b2d4f6a..." }
```

### Respuesta exitosa — `200 OK`

```json
{
  "userId": "b41d9a12-...",
  "status": "ACTIVE",
  "message": "Tu cuenta fue verificada. Ya puedes participar."
}
```

### Modos de fallo

| Código | `error` | Cuándo | Requisito |
|---|---|---|---|
| `400` | `INVALID_TOKEN` | El token no corresponde a ningún `auth_tokens.token_hash` de tipo `EMAIL_VERIFICATION`. | RF-124 |
| `410` | `EXPIRED_TOKEN` | El token existe pero `expires_at` ya pasó y nunca se consumió. `details.expiredAt` incluido, junto con la indicación de cómo pedir uno nuevo (Historia 2, escenario 4). | RF-108, RF-124 |
| `409` | `ACCOUNT_NOT_ELIGIBLE` | El token es válido, pero la cuenta ya no está en un estado verificable (el administrador la rechazó o deshabilitó mientras el correo esperaba verificación). | RF-126 |

### Comportamiento de idempotencia

| Escenario | Resultado |
|---|---|
| Primer uso del token, cuenta `PENDING` | `200`, la cuenta pasa a `ACTIVE` |
| Reintento con el mismo token, ya consumido, y la cuenta ya está `ACTIVE` | `200`, mismo mensaje de éxito, sin efecto nuevo — evita un error confuso ante un doble clic en el enlace del correo |
| Token nunca usado, vencido | `410 EXPIRED_TOKEN` |
| Token de una cuenta que fue rechazada/deshabilitada por el admin mientras esperaba verificación | `409 ACCOUNT_NOT_ELIGIBLE`, nunca `200` |

### Garantías transaccionales

1. Buscar `auth_tokens` por hash del token recibido, `type = 'EMAIL_VERIFICATION'`.
2. Si no existe → `400`. Si `expires_at < now()` y `consumed_at IS NULL` →
   `410`.
3. Si `consumed_at IS NOT NULL`: comprobar el estado actual del usuario. Si ya
   es `ACTIVE`, responder `200` idempotente (no se toca nada). Si no, es un
   estado inconsistente y se trata como `409 ACCOUNT_NOT_ELIGIBLE`.
4. Dentro de una transacción: marcar `auth_tokens.consumed_at = now()`
   (protegido por el trigger `no_reconsume_auth_token`, que impide una
   segunda escritura sobre el mismo campo); si `new_email` no es nulo (caso de
   corrección de correo, RF-112a), actualizar `users.email = new_email`; si es
   nulo (verificación de registro), actualizar `users.status = 'ACTIVE'`;
   insertar en `audit_log`.
5. Confirmar.

### Prueba de contrato obligatoria

Un token usado dos veces con la cuenta ya activa no debe producir un segundo
efecto ni un error confuso — es el escenario más común en producción (alguien
hace doble clic en el enlace del correo) y su prueba no es opcional.
