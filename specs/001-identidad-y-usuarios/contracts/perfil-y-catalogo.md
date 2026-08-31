# Contrato: Perfil de alumno, catálogo y monitoreo

**Feature:** `001-identidad-y-usuarios`
**Requisitos que satisface:** RF-110 a RF-116, RF-120, RF-128

> Índice de endpoints con su autorización y modos de fallo principales. El
> contrato línea por línea se termina de redactar en `001-b` si hace falta
> más detalle del que da esta tabla.

---

## `GET /api/v1/me/profile`, `PATCH /api/v1/me/profile`

Perfil propio del alumno autenticado. `PATCH` acepta los campos opcionales de
RF-110 (`bio`, `interests`, `accessibilityNeeds`, `professionalLink`) y los
de contacto (`phone`). **Rechaza** intentos de editar `studentCode` o
`careerId` una vez `users.status = 'ACTIVE'` (RF-112) — usa
`POST /me/correction-requests` (ver `usuarios-y-roles.md`) en su lugar.

| Código | `error` | Cuándo |
|---|---|---|
| `403` | `FIELD_LOCKED` | Intento de editar `studentCode`/`careerId` con la cuenta ya activa. `details.field` indica cuál. |

## `POST /api/v1/me/avatar`

`multipart/form-data`. Valida **tipo real del archivo** (no solo la
extensión) y tamaño máximo. Un archivo inválido no debe alterar el avatar
existente (Historia 2, escenario 3).

| Código | `error` | Cuándo |
|---|---|---|
| `422` | `INVALID_IMAGE` | El archivo no es una imagen válida en un formato admitido. |
| `413` | `FILE_TOO_LARGE` | Excede el tamaño máximo configurado. |

Respuesta `200`: `{ avatarUrl }`. El archivo se renombra en el servidor (skill
`seguridad-y-roles`: nunca se confía en el nombre original).

## `GET /api/v1/students`

Listado de monitoreo con filtros (RF-113): `career`, `faculty`, `status`,
texto libre (nombre o código). Paginado,
`{ data, meta: { page, limit, total, totalPages } }`. Cada fila incluye
nombre, carrera, estado y `totalPoints` (columna que agrega `003`).

**Autorización:** exclusivo `ADMIN`. `STAFF` recibe `403` (RF-115).

| Código | `error` | Cuándo |
|---|---|---|
| `403` | `FORBIDDEN` | Rol `STAFF` intentando acceder al listado global. |

## `GET /api/v1/students/:id`

Detalle de progreso individual (RF-114). Mismo guard que el listado.

## `GET /api/v1/students/export`

Exportación tabular abierta (RF-120 — exporta el propio registro que
construye el sistema, no un padrón externo importado; ver nota en `spec.md`
y ADR-007). Formato CSV. Exclusivo `ADMIN`, queda auditado (acceso masivo a
datos personales, Artículo V).

## `GET /api/v1/faculties`, `POST /api/v1/faculties`, `PATCH /api/v1/faculties/:id`
## `GET /api/v1/careers`, `POST /api/v1/careers`, `PATCH /api/v1/careers/:id`

Catálogo académico (RF-116). Lectura (`GET`) sin autenticación —el formulario
público de registro necesita listar carreras antes de que exista sesión.
Escritura exclusiva `ADMIN`.

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `DUPLICATE_CAREER` | Nombre de carrera ya existente dentro de la misma facultad (`unique_career_per_faculty`). |

## `GET /api/v1/consent-versions`, `POST /api/v1/consent-versions`

Gestión del texto de consentimiento (RF-128). `POST` crea una nueva versión y
la marca activa — desactiva la anterior en la misma transacción
(`one_active_consent_version`). Exclusivo `ADMIN`.

## `GET /api/v1/public/consent-version`

Versión activa actual, sin autenticación — el formulario de registro la
muestra antes de enviar `consentVersionId` (ver
`auto-registro-y-verificacion.md`). Respuesta: `{ id, version, body }`.
