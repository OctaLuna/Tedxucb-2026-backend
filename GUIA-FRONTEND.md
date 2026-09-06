# Guía de integración para el frontend — TEDxUCB

Este repositorio (`Ted_backend`) contiene **únicamente el backend/API**. El
frontend (sitio público, panel de alumno/staff) vive en un repositorio
aparte y consume esta API como cliente HTTP — ver
[`docs/decisiones/ADR-006-repositorio-solo-backend.md`](docs/decisiones/ADR-006-repositorio-solo-backend.md).
Esta guía reúne lo que un equipo de frontend necesita para conectarse: cómo
levantar el backend en local, cómo autenticarse, y dónde está el detalle
exacto de cada endpoint.

## 1. Levantar el backend en local

Requisitos: Docker, Node.js, npm.

```bash
# 1. Dependencias de infraestructura: Postgres, Redis, Mailpit
docker compose up -d

# 2. Variables de entorno (los valores por defecto ya calzan con docker-compose.yml)
cp .env.example .env

# 3. Dependencias de Node
npm install

# 4. Aplicar el esquema de base de datos
npx prisma migrate deploy

# 5. Sembrar datos de desarrollo (admin, catálogo de prueba, evento, consentimiento)
npx prisma db seed

# 6. Levantar la API con recarga en caliente
npm run start:dev
```

La API queda escuchando en `http://localhost:3000`. **Mailpit** (donde caen
todos los correos que envía el backend — verificación de correo,
invitaciones de staff, notificaciones de check-in y de selección) expone su
interfaz web en `http://localhost:8025`: útil para completar a mano el
flujo de auto-registro de un alumno o de aceptación de una invitación sin
un servidor de correo real.

| Servicio | Puerto |
|---|---|
| API (NestJS) | `3000` |
| PostgreSQL | `5432` |
| Redis | `6379` |
| Mailpit — SMTP | `1025` |
| Mailpit — UI / API REST | `8025` |

## 2. URL base y documentación interactiva

- **Prefijo de toda la API**: `http://localhost:3000/api/v1` — todas las
  rutas de esta guía y de los contratos van sin este prefijo por brevedad,
  agrégalo siempre.
- **Swagger (interactivo)**: `http://localhost:3000/api/docs` — lista los
  ~80 endpoints agrupados por módulo, con el botón **Authorize** para
  probar peticiones autenticadas pegando un `accessToken` real (ver
  sección 4).
- **Documento OpenAPI crudo**: `http://localhost:3000/api/docs-json` — útil
  para generar un cliente HTTP tipado (`openapi-typescript`, `orval`, etc.)
  en vez de tipar las peticiones a mano.
- **Fuente exacta de cada respuesta**: Swagger infiere los DTO de petición
  automáticamente, pero varias respuestas son objetos compuestos ad-hoc
  (por ejemplo la del check-in, que junta datos de tres tablas) y ahí
  aparecen como objetos genéricos. La forma exacta de cada respuesta,
  incluidos todos los modos de fallo con su código HTTP, vive en
  [`specs/*/contracts/*.md`](specs/) — es la fuente de verdad cuando
  Swagger no alcanza.

## 3. CORS

El backend solo permite **un origen a la vez**, vía la variable
`CORS_ORIGIN` de su `.env` (por defecto `http://localhost:5173`, el puerto
típico de un `vite dev`). Si el frontend corre en otro host o puerto, hay
que cambiar esa variable en el `.env` del backend y reiniciarlo.

No hay `credentials: true` configurado — no se usan cookies para nada, toda
la autenticación es por token en la cabecera `Authorization` (sección 4).

## 4. Autenticación

Todo es JWT por cabecera `Authorization: Bearer <accessToken>`, sin
cookies. No hay auto-registro para `ADMIN`/`STAFF` — solo los alumnos se
auto-registran (`POST /auth/register`); el resto se crea por invitación de
un admin ya activo. Para el primer admin, ver la sección 6 (credenciales de
desarrollo, ya sembradas).

### `POST /auth/login`

```json
// Petición
{ "email": "admin@tedxucb.local", "password": "unaClaveSegura9" }
```
```json
// Respuesta 200
{
  "accessToken": "eyJ...",
  "refreshToken": "fbc2...",
  "expiresIn": 900,
  "user": { "id": "...", "fullName": "...", "roles": ["ADMIN"], "status": "ACTIVE" }
}
```
- `401 INVALID_CREDENTIALS` — correo o contraseña incorrectos (mensaje
  idéntico para ambos casos, a propósito).
- `403 ACCOUNT_NOT_ACTIVE` — la cuenta existe pero no está `ACTIVE`
  (incluye `details: { status }`).
- Limitado a 10 peticiones/minuto por IP.

### Duración de los tokens

| Token | Duración |
|---|---|
| `accessToken` | 15 minutos, fija |
| `refreshToken` | 30 días (`REFRESH_TOKEN_TTL_DAYS` en `.env`) |

### Refrescar sesión

`POST /auth/refresh` con `{ "refreshToken": "..." }` devuelve un nuevo par
`{ accessToken, refreshToken, expiresIn }`. El refresh token es **de un
solo uso**: al usarlo se invalida y se emite uno nuevo (guárdalo de
inmediato). Reutilizar uno ya usado revoca **todas** las sesiones del
usuario — es la señal de que alguien tiene una copia del token.

### Cerrar sesión

- `POST /auth/logout` con `{ "refreshToken": "..." }` → `204`, revoca solo
  esa sesión.
- `POST /auth/logout-all` (requiere `Authorization: Bearer`) → `204`,
  revoca todas las sesiones del usuario.

### Perfil del usuario autenticado

`GET /me` (requiere `Authorization: Bearer`) → `{ id, email, fullName,
roles, status }`.

## 5. Credenciales de desarrollo

Sembradas por `npx prisma db seed` (`prisma/seed.ts`) — **solo para
entornos de desarrollo/pruebas**, nunca se siembran si `NODE_ENV=production`:

| Campo | Valor |
|---|---|
| Correo | `admin@tedxucb.local` |
| Contraseña | `unaClaveSegura9` |
| Rol | `ADMIN` |

Con esta cuenta se puede crear al resto del staff (`POST /users`, ver
Swagger o `specs/001-identidad-y-usuarios/contracts/usuarios-y-roles.md`) y
operar cualquier endpoint administrativo.

## 6. Roles

| Rol | Alcance |
|---|---|
| `ADMIN` | Control total: administra y monitorea. |
| `STAFF` | Valida participación solo en las actividades donde está asignado explícitamente — no hay staff con acceso global. |
| `ALUMNO` | Su propio perfil, historial de puntos y progreso. Nada de otros alumnos. |

Un usuario puede tener varios roles a la vez (p. ej. un alumno que también
es staff de una actividad).

## 7. Formato uniforme de error y de paginación

Todo error de la API tiene esta forma, sin excepción:

```json
{
  "statusCode": 409,
  "error": "ALREADY_CHECKED_IN",
  "message": "Este alumno ya fue registrado en esta actividad.",
  "details": { "checkedInAt": "2026-09-15T19:28:11Z" }
}
```

`error` es estable y pensado para que el cliente decida sobre él (nunca
cambia de texto); `message` es para mostrar directamente a una persona;
`details` es opcional y trae lo necesario para resolver la situación.

Todo listado paginado responde:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 312, "totalPages": 16 } }
```
con `?page=1&limit=20` como parámetros de consulta.

## 8. Índice de módulos

Mismos tags que agrupan los endpoints en Swagger:

| Tag | Cubre |
|---|---|
| `auth` | Login, registro, verificación de correo, refresh, logout, recuperación de contraseña. |
| `users` | Alta de staff/admin, roles, revisión de auto-registros pendientes, solicitudes de corrección, auditoría. |
| `profiles` | Perfil propio, avatar, listado de alumnos, catálogo de facultades/carreras, versión de consentimiento. |
| `content` | Evento (fecha, sede, cuenta atrás, `studentCapacity`), bloques de contenido del sitio. |
| `speakers` | Postulaciones de speakers, revisión, conversión a ficha pública, fotos. |
| `activities` | Categorías, CRUD de actividades, asignación de staff, QR del alumno, check-in (escaneo y manual), métricas. |
| `points` | Ajustes de puntos, reversiones, historial propio. |
| `leaderboard` | Ranking, exportación CSV, progreso propio. |
| `selection` | Ejecución de la selección de asistentes, asignación manual, revocación, entrada del alumno, escaneo en la puerta, aforo en vivo. |
| `public` | Endpoints sin autenticar: evento público, ficha pública de speakers, postulación pública, versión de consentimiento pública. |
| `health` | `GET /health` — verificación de disponibilidad. |

Detalle endpoint por endpoint: Swagger (`/api/docs`) para forma de
petición/respuesta, `specs/*/contracts/*.md` para cada modo de fallo con su
código HTTP exacto.

## 9. Archivos estáticos

Fuera de `/api/v1` (igual que `/api/docs`), servidos directo por Express:

- `/uploads/avatars/*` — avatares de alumnos.
- `/uploads/events/*` — imagen del evento.
- `/uploads/speakers/*` — fotos de speakers.

Las rutas completas (p. ej. `avatarUrl`) vienen ya armadas en las
respuestas de la API — no hay que construirlas a mano.
