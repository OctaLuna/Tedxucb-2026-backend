# Contrato: Actividades, categorías y staff

**Feature:** `003-motor-de-puntos`
**Requisitos que satisface:** RF-301 a RF-310c

> Escrito 2026-09-02, al ejecutar `003-a`. No existía en el diseño original
> de la feature (solo `checkin.md` y `points-and-leaderboard.md` se habían
> redactado) — Artículo IX exige el contrato antes que el código, así que se
> cierra este vacío antes de escribir `ActivitiesController`.

---

## Catálogo (cualquier rol autenticado)

### `GET /api/v1/activities?page=1&limit=20&status={status}`

**Autorización:** cualquier usuario autenticado (`ALUMNO`, `STAFF` o
`ADMIN`). RF-310c: el catálogo con su valor en puntos debe ser consultable
antes de participar — las reglas del juego se comunican antes, no después.

Para `ALUMNO`/`STAFF`, el filtro `status` del querystring se **ignora** del
lado del servidor: siempre se devuelven únicamente actividades
`PUBLISHED`, sin importar lo que pida el cliente (verificación server-side,
nunca confiada al cliente). Para `ADMIN`, `status` si se envía filtra
libremente entre los cuatro estados; sin filtro, devuelve todas.

```json
{
  "data": [
    {
      "id": "3c7a...",
      "title": "Taller de Economía Circular",
      "description": "...",
      "category": { "id": "...", "name": "Taller" },
      "location": "Auditorio menor",
      "pointsValue": 10,
      "startsAt": "2026-09-15T18:00:00Z",
      "endsAt": "2026-09-15T20:00:00Z",
      "checkinOpensAt": "2026-09-15T17:45:00Z",
      "checkinClosesAt": "2026-09-15T19:30:00Z",
      "allowMultipleCheckins": false,
      "status": "PUBLISHED"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
}
```

### `GET /api/v1/activities/:id`

Mismo criterio de visibilidad que la lista: un `ALUMNO`/`STAFF` que pide una
actividad `DRAFT`/`CANCELLED` recibe `404 NOT_FOUND` (no se revela que
existe, mismo criterio que el resto del proyecto para recursos fuera de
alcance del solicitante).

---

## CRUD (solo `ADMIN`)

### `POST /api/v1/activities`

```json
{
  "title": "Taller de Economía Circular",
  "description": "...",
  "categoryId": "...",
  "location": "Auditorio menor",
  "pointsValue": 10,
  "startsAt": "2026-09-15T18:00:00Z",
  "endsAt": "2026-09-15T20:00:00Z",
  "checkinOpensAt": "2026-09-15T17:45:00Z",
  "checkinClosesAt": "2026-09-15T19:30:00Z",
  "allowMultipleCheckins": false
}
```

Nace siempre en `DRAFT` (RF-303) — el cliente no puede crearla ya publicada.

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Campo obligatorio ausente, `pointsValue <= 0` (RF-302), `endsAt <= startsAt`, o `checkinClosesAt <= checkinOpensAt`. |

### `PATCH /api/v1/activities/:id`

Acepta cualquier campo editable (título, descripción, categoría, lugar,
ventanas, `pointsValue`, `allowMultipleCheckins`) y/o `status` para
transicionar la máquina de estados:

```
DRAFT → PUBLISHED | CANCELLED
PUBLISHED → CLOSED | CANCELLED
CLOSED → CANCELLED
CANCELLED → (terminal, ninguna transición sale de aquí)
```

Publicar (`DRAFT → PUBLISHED`) exige tener `categoryId`, ventanas y
`pointsValue` ya definidos (siempre lo están, son obligatorios desde la
creación). **Cambiar `pointsValue` de una actividad con participaciones ya
registradas NO recalcula lo ya otorgado** (RF-306): el valor queda
capturado en cada `point_transactions.points` al momento del check-in, no
referenciado en vivo.

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `NOT_FOUND` | El id no existe. |
| `409` | `INVALID_STATUS_TRANSITION` | La transición de estado pedida no es válida (ver tabla arriba). |

Para cancelar con reversión en bloque, usar el endpoint dedicado de abajo,
no `status: "CANCELLED"` por este mismo `PATCH` — es una operación compuesta
(cambia el estado y, opcionalmente, revierte puntos ya otorgados), mismo
criterio que ya separa `convert-to-speaker` de un `PATCH` genérico en `002`.

### `POST /api/v1/activities/:id/cancel`

```json
{ "revertPoints": true }
```

Cancela la actividad (`→ CANCELLED`, válida desde cualquier estado no
terminal) y, si `revertPoints` es `true`, revierte en bloque todos los
movimientos `ACTIVITY` de esa actividad que no tengan ya una reversión
(RF-308). El administrador decide explícitamente: no se revierte por
default, porque puede ser justo conservar los puntos si los alumnos ya
habían asistido (caso límite del spec).

```json
{ "activityId": "3c7a...", "status": "CANCELLED", "reversedCount": 8 }
```

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `NOT_FOUND` | El id no existe. |
| `409` | `INVALID_STATUS_TRANSITION` | La actividad ya está `CANCELLED`. |

### `DELETE /api/v1/activities/:id`

Solo si la actividad no tiene ninguna asistencia registrada (RF-307).

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `NOT_FOUND` | El id no existe. |
| `409` | `ACTIVITY_HAS_ATTENDANCES` | Tiene asistencias registradas; usa `POST .../cancel` en su lugar. Incluye `attendanceCount`. |

---

## Asignación de staff (solo `ADMIN`)

### `GET /api/v1/activities/:id/staff`

Lista los miembros de staff asignados a la actividad.

### `POST /api/v1/activities/:id/staff`

```json
{ "userId": "..." }
```

Asigna un usuario (con rol `STAFF` o `ADMIN`) a la actividad — RF-304. Idempotente:
asignar dos veces al mismo usuario no produce error ni fila duplicada
(`@@id([activityId, userId])` en el esquema).

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `NOT_FOUND` | La actividad o el usuario no existen. |
| `422` | `INVALID_STAFF_ROLE` | El usuario no tiene rol `STAFF` ni `ADMIN`. |

### `DELETE /api/v1/activities/:id/staff/:userId`

Retira la asignación (RF-304). No afecta las asistencias que ese staff ya
validó — el historial conserva quién validó cada una, aunque después se le
retire el acceso.

---

## Categorías (`GET` cualquier autenticado, `POST`/`PATCH` solo `ADMIN`)

### `GET /api/v1/activity-categories`

```json
[{ "id": "...", "name": "Taller", "color": "#4CAF50", "suggestedPoints": 10 }]
```

Sin paginar (colección acotada por diseño, mismo criterio que
`content-blocks` en `002`).

### `POST /api/v1/activity-categories`

```json
{ "name": "Taller", "color": "#4CAF50", "suggestedPoints": 10 }
```

`suggestedPoints` es el valor sugerido de RF-310a — opcional, el admin lo
define para que actividades nuevas de esa categoría partan de una
referencia coherente (RF-310b: el admin también ve los valores de
actividades ya creadas al definir una nueva, vía el catálogo de arriba).

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `DUPLICATE_CATEGORY` | Ya existe una categoría con ese nombre. |

### `PATCH /api/v1/activity-categories/:id`

Edita `name`/`color`/`suggestedPoints`. Mismos modos de fallo que `POST`.

---

## Métricas (solo `ADMIN`)

> Añadido 2026-09-02, T093, al ejecutar `003-c` — CE-301 y CE-304 de
> `spec.md`. No hay infraestructura de métricas en este proyecto (sin
> Prometheus/StatsD); en vez de construirla para dos números, esta sección
> expone lo mínimo verificable con lo que ya existe.

### `GET /api/v1/activities/metrics`

```json
{ "totalCheckins": 812, "manualCheckins": 14, "manualRatio": 0.017 }
```

`manualRatio` cumple CE-304 (menos del 5% por vía manual — un valor alto
indica que el escaneo no está funcionando en campo). **CE-301 (latencia
desde que el staff abre el escáner hasta la confirmación en pantalla) no
es enteramente medible desde el backend** — incluye tiempo del lado del
cliente, fuera de este repositorio (ADR-006). La contribución del backend
(duración del `POST .../checkin` en sí) queda como línea de log
estructurada en cada check-in, no como este endpoint ni como una tabla
nueva: no existe hoy infraestructura de agregación de logs en este
proyecto, y construir una tabla de métricas solo para un p95 es
exactamente el tipo de anticipación que el Artículo VII prohíbe. Si el
evento revela que hace falta, se reabre con su propio ciclo de spec.
