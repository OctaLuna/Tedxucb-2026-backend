# Contrato: Puntos, correcciones y ranking

**Feature:** `003-motor-de-puntos`
**Requisitos que satisface:** RF-324 a RF-333, RF-338 a RF-342

> Renombrado 2026-09-02 (antes `points-and-claims.md`): sin sección de
> reclamos, ver ADR-008.

---

## Historial del alumno

### `GET /api/v1/me/points?page=1&limit=20`

**Autorización:** rol `ALUMNO`, solo sobre su propio historial.

```json
{
  "data": [
    {
      "id": "9c1f...",
      "points": 10,
      "type": "ACTIVITY",
      "activity": { "id": "3c7a...", "title": "Taller de Economía Circular" },
      "reason": null,
      "method": "STAFF_SCAN",
      "createdAt": "2026-09-15T19:32:04Z"
    },
    {
      "id": "7b2e...",
      "points": -10,
      "type": "REVERSAL",
      "reversesId": "9c1f...",
      "reason": "Registro duplicado por error del staff",
      "createdAt": "2026-09-16T10:04:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 },
  "summary": { "totalPoints": 45, "activitiesAttended": 5 }
}
```

Ambos movimientos aparecen: el original y su reversión, cada uno con su motivo
(RF-329, Artículo IV). El alumno nunca debe encontrarse con un puntaje que
cambió sin explicación.

### `GET /api/v1/me/progress`

```json
{
  "totalPoints": 45,
  "rank": 37,
  "totalStudents": 312
}
```

**Resuelto 2026-09-02:** se elimina `pointsToCutoff`. No solo porque ya no
existe "corte" como fecha del sistema (ver ADR-008), sino porque calcularlo
exigiría que `003` conociera el número de cupos, un dato que pertenece a
`004` — `spec.md` de `003` declara explícitamente que no cubre la asignación
de cupos. Si se quiere mostrar proximidad al umbral de selección, ese
cálculo vive en `004` (que sí conoce el número de cupos), no aquí.

---

## Correcciones (solo `ADMIN`)

### `POST /api/v1/points/adjustments`

```json
{
  "studentId": "b41d9a...",
  "points": 15,
  "type": "BONUS",
  "reason": "Coordinación del taller de sostenibilidad del 12 de septiembre"
}
```

`type` admite `BONUS`, `PENALTY` o `ADJUSTMENT`. `reason` es obligatoria en los
tres casos (RF-330).

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `REASON_REQUIRED` | Motivo ausente o vacío. |
| `400` | `ZERO_POINTS` | `points` igual a cero. |
| `403` | `FORBIDDEN` | El solicitante no es administrador. |

Una penalización mayor que el puntaje actual **no** falla: el puntaje queda en
cero y la respuesta lo indica (RF-328).

```json
{ "transactionId": "e4d1...", "newTotal": 0, "truncated": true }
```

### `POST /api/v1/points/{transactionId}/reverse`

```json
{ "reason": "Doble registro en la feria del 20 de septiembre" }
```

Crea un movimiento nuevo de signo contrario que apunta al original. **No
modifica ni elimina nada** (RF-325, RF-326).

| Código | `error` | Cuándo |
|---|---|---|
| `409` | `ALREADY_REVERSED` | Ese movimiento ya fue revertido. Incluye el id de la reversión existente. |
| `422` | `CANNOT_REVERSE_REVERSAL` | No se revierte una reversión; para eso se emite un ajuste. |

La restricción única sobre `reverses_id` garantiza el primer caso a nivel de
motor, no por confianza en la lógica de aplicación.

---

## Ranking

### `GET /api/v1/leaderboard?limit=50&career={id}&faculty={id}`

**Autorización:** cualquier alumno autenticado, además de `ADMIN` y `STAFF`,
accede al ranking completo (RF-342, **resuelto 2026-09-02:** visible para
todos, no solo la posición propia).

```json
{
  "data": [
    { "position": 1, "studentId": "...", "fullName": "...", "career": "Derecho", "totalPoints": 120 }
  ],
  "meta": { "totalStudents": 312, "generatedAt": "2026-10-01T15:00:00Z" }
}
```

Los alumnos deshabilitados quedan excluidos (RF-340). El desempate es
determinista: precede quien alcanzó el puntaje primero (RF-339).

### `GET /api/v1/leaderboard/export` — rol `ADMIN`

Devuelve el ranking en formato tabular abierto (RF-341).

---

## Operación de consola (Artículo II)

```
$ points-cli reconcile --student 202012345 --json
```

```json
{
  "studentId": "b41d9a...",
  "studentCode": "202012345",
  "cachedTotal": 45,
  "ledgerSum": 45,
  "consistent": true,
  "transactionCount": 7
}
```

Debe poder ejecutarse en producción durante el evento, sin depender de la
interfaz web. Es la herramienta con la que se diagnostica y corrige
cualquier inconsistencia detectada, cualquier día de la operación del
evento.

Con `--all` recorre el padrón completo y devuelve solo las inconsistencias
(RF-332). Con `--fix` recalcula la caché desde el libro mayor (RF-333), dejando
constancia en auditoría de que la corrección ocurrió y de quién la ejecutó.
