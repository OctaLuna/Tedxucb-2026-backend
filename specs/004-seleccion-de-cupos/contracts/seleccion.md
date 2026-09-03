# Contrato: Selección de asistentes y control de acceso

**Feature:** `004-seleccion-de-cupos`
**Requisitos que satisface:** RF-401 a RF-423 (tras ADR-009, 2026-09-03)

---

## Aforo del evento

`events.capacity`/`events.student_capacity` (RF-401) se configuran vía el
`PATCH /api/v1/events/:id` que ya existe (`002`,
`contracts/evento-y-cuenta-regresiva.md`) — se le agrega `studentCapacity`
a `UpdateEventDto`. No hay endpoint nuevo para esto en `004`.

---

## Ejecución de la selección (solo `ADMIN`)

### `POST /api/v1/selection/execute`

Sin cuerpo — usa el evento `PUBLISHED` vigente (`002`, singleton) y su
`studentCapacity` configurado. Dentro de una única transacción: crea el
`selection_run`, selecciona a los mejores posicionados del ranking de `003`
hasta agotar `studentCapacity` (excluyendo deshabilitados, RF-409),
congela puntaje/posición de cada uno (RF-404), genera su entrada
(RF-416), y encola el aviso — la notificación se encola **después** de
confirmar, nunca dentro de la transacción, mismo principio que el
check-in de `003`.

```json
{
  "runId": "a1f0...",
  "executedAt": "2026-10-20T15:00:00Z",
  "studentCapacity": 80,
  "selectedCount": 80
}
```

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `EVENT_NOT_CONFIGURED` | No hay evento `PUBLISHED` (mismo código que ya usa `002` para el mismo caso). |
| `422` | `CAPACITY_NOT_CONFIGURED` | `studentCapacity` del evento es nulo — nada que ejecutar sin ese número. |
| `409` | `SELECTION_ALREADY_ACTIVE` | Ya existe una ejecución sin revertir para este evento (RF-408). Incluye `runId`/`executedAt` de la activa. |

### `POST /api/v1/selection/revert`

```json
{ "reason": "Aforo confirmado más grande, se necesita re-ejecutar con el número correcto." }
```

Revierte la ejecución activa: marca `selection_runs.reverted_at` y, en la
misma transacción, `revoked_at` en cascada sobre todas sus `selections`
vivas (RF-408). **No borra nada** (Artículo IV en espíritu) — el registro
de que existió y se revirtió queda.

```json
{ "runId": "a1f0...", "revertedAt": "2026-10-20T16:00:00Z", "revokedCount": 80 }
```

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `REASON_REQUIRED` | Motivo ausente o vacío. |
| `404` | `NOT_FOUND` | No hay ejecución activa para revertir. |

### `GET /api/v1/selection`

Resultado de la ejecución activa (si existe), con la distribución por
carrera/facultad que exige RF-407a.

```json
{
  "run": { "id": "a1f0...", "executedAt": "...", "executedBy": "Ana Pérez", "studentCapacity": 80 },
  "data": [
    {
      "selectionId": "...", "source": "RANKING", "studentId": "...",
      "fullName": "...", "career": "Derecho", "pointsAtSelection": 120,
      "rankAtSelection": 1, "audienceType": "ESTUDIANTE", "entryUsed": false
    }
  ],
  "distribution": [{ "career": "Derecho", "faculty": "Ciencias Jurídicas", "count": 12 }]
}
```

`404 NOT_FOUND` si nunca se ejecutó (o la única ejecución fue revertida).

### `POST /api/v1/selection/manual`

RF-420 (lugares no estudiantiles) y el caso límite de cubrir a mano un
lugar liberado son la misma operación (ADR-009).

```json
{
  "studentId": null,
  "fullName": "Jorge Salazar",
  "email": "jorge.salazar@ejemplo.com",
  "audienceType": "Docente",
  "reason": "Invitado por la Facultad de Ciencias Jurídicas"
}
```

Si `studentId` viene informado, `fullName`/`email` se resuelven del padrón
y se ignoran si se envían igual. `reason` siempre obligatorio (RF-422,
toda asignación manual queda auditada).

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `REASON_REQUIRED` | Motivo ausente o vacío. |
| `400` | `CONTACT_REQUIRED` | Sin `studentId`, faltan `fullName`/`email`. |
| `404` | `NOT_FOUND` | `studentId` no corresponde a ningún alumno. |
| `409` | `ALREADY_SELECTED` | Ese `studentId` ya tiene una selección viva. |
| `422` | `CAPACITY_EXCEEDED` | Asignar este lugar excede `events.capacity` total (RF-420 escenario 2, advertencia antes de excederlo). |

### `POST /api/v1/selection/{id}/revoke`

Libera el lugar de una persona ya seleccionada (deshabilitada, avisó que
no puede ir, etc. — caso límite de `spec.md`), sin revertir toda la
ejecución. El lugar queda vacante hasta que el administrador decida
llenarlo a mano (`POST /selection/manual`) o dejarlo vacío.

```json
{ "reason": "El alumno avisó que no podrá asistir." }
```

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `REASON_REQUIRED` | Motivo ausente o vacío. |
| `404` | `NOT_FOUND` | `id` no existe. |
| `409` | `ALREADY_REVOKED` | Ese lugar ya estaba liberado. |

### `GET /api/v1/selection/export` — CSV, RF-421

Mismo formato que `GET /leaderboard/export` (`003`): BOM UTF-8, columnas
`"Nombre","Correo","Tipo","Carrera","Entrada usada"`. Auditado
(`SELECTION_EXPORTED`).

---

## El alumno consulta su propio lugar

### `GET /api/v1/me/entry`

**Autorización:** rol `ALUMNO`, sobre su propio resultado exclusivamente.

```json
{ "selected": true, "audienceType": "ESTUDIANTE", "entryCode": "9F3A-7C21-...", "used": false }
```

`selected: false` (sin más campos) si el alumno no tiene una selección
viva — nunca se le dice por qué ni su posición (RF-423, sin notificación
proactiva; consultar `/leaderboard`/`/me/progress` de `003` es lo que
existe para eso).

---

## Control de acceso el día del evento

### `POST /api/v1/entries/scan`

**Autorización:** rol `STAFF` o `ADMIN` — a diferencia del check-in de
`003`, aquí no hace falta asignación explícita por actividad: cualquier
staff habilitado puede validar entradas en la puerta (un solo punto de
control, no docenas de actividades paralelas).

```json
{ "entryCode": "9F3A-7C21-..." }
```

Verificación en el servidor, nunca en el cliente (mismo principio que
`checkin.md`). `UPDATE ... WHERE entry_code_hash = $1 AND entry_used_at IS
NULL` condicionado (Artículo IX): si afecta cero filas, ya estaba usada.

```json
{ "fullName": "María Fernanda Quispe Aliaga", "audienceType": "ESTUDIANTE", "enteredAt": "2026-11-09T18:32:04Z" }
```

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `INVALID_ENTRY` | El código no corresponde a ninguna entrada, o fue revocada. |
| `409` | `ALREADY_USED` | Ya se usó. Incluye `usedAt` y `validatedBy` del primer ingreso (RF-417). |

### `GET /api/v1/entries/live`

**Autorización:** `ADMIN`. RF-419, aforo ocupado en tiempo real.

```json
{ "totalCapacity": 100, "entered": 63, "studentCapacity": 80, "studentsEntered": 51 }
```

---

## Idempotencia

`POST /selection/execute` y `POST /entries/scan` son las dos operaciones
que escriben. Ninguna admite reintento silencioso: un segundo `execute`
sin revertir es `409 SELECTION_ALREADY_ACTIVE`, no un `200` con el
resultado previo (a diferencia del ajuste de `points`, acá repetir la
ejecución sin querer es exactamente lo que RF-408 exige impedir, no un
caso de red inestable a tolerar). Un segundo `scan` de la misma entrada es
`409 ALREADY_USED`, mismo criterio que `ALREADY_CHECKED_IN` de `003`.
