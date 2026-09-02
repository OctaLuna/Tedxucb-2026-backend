# Contrato: Evento y cuenta regresiva

**Feature:** `002-sitio-publico`
**Requisitos que satisface:** RF-201, RF-204, RF-205, RF-218, RF-220
**Pieza más sutil del contrato:** resolver "hora del servidor, no del
dispositivo" (RF-204) sin recalcular en cada request algo que el cliente
puede calcular solo si tiene los dos valores correctos.

> Este contrato se escribe **antes** que la implementación (Artículo IX).

---

## `GET /api/v1/public/event`

Devuelve el evento vigente y la hora del servidor en la misma respuesta, para
que el cliente calcule la cuenta regresiva sin depender de su propio reloj.

**Autorización:** ninguna. Ruta pública (RF-201).

**Rate limit:** `{ keyPrefix: 'public-event', limit: 60, windowSeconds: 60 }`
— lectura liviana de la página principal, límite generoso pero real contra
scraping agresivo.

**Cache:** `Cache-Control: no-store`. Si esta respuesta se cachea,
`serverTime` queda desactualizado por el tiempo que la caché viva, y el
propósito completo del campo (blindar contra un reloj de cliente desajustado)
se pierde.

### Respuesta exitosa — `200 OK`

```json
{
  "event": {
    "id": "3f2a1c9e-...",
    "name": "TEDxUCB",
    "tagline": null,
    "startsAt": "2026-11-09T18:00:00Z",
    "venue": null,
    "capacity": null,
    "imageUrl": null
  },
  "serverTime": "2026-09-01T14:32:04.211Z",
  "eventStatus": "UPCOMING"
}
```

| Campo | Descripción |
|---|---|
| `event.startsAt` | Fecha y hora canónica del evento, ISO 8601 UTC. Es el valor que cambia si el admin reprograma. |
| `serverTime` | Hora actual del servidor en el momento de responder, ISO 8601 UTC con milisegundos. El cliente calcula `remaining = startsAt - serverTime` una vez al cargar, y a partir de ahí hace tick localmente con su propio temporizador — nunca vuelve a confiar en su reloj de pared para la resta inicial. |
| `eventStatus` | `"UPCOMING"` o `"FINISHED"`, calculado por el servidor como `serverTime >= startsAt`. Existe para que el cliente no tenga que reimplementar la comparación de borde (RF-205) — el frontend decide cómo mostrarlo "con elegancia", pero el hecho de si ya pasó lo decide el servidor. |
| `event.imageUrl` | Imagen representativa para metadatos Open Graph (RF-218). `null` hasta que el admin la suba. |

El resto de campos (`name`, `tagline`, `venue`, `capacity`) satisface RF-220
(sede y datos generales) y, junto con `imageUrl` y un `content_block` de
descripción, RF-218 (vista previa en redes).

### Modos de fallo

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `EVENT_NOT_CONFIGURED` | No existe ninguna fila con `status = 'PUBLISHED'`. No debería ocurrir en producción (se siembra una al desplegar — ver `data-model.md` §6), pero un ambiente recién levantado sin seed debe fallar con un mensaje claro, no devolver datos vacíos como si fueran reales. |
| `429` | `TOO_MANY_REQUESTS` | Límite de frecuencia superado. |

### Garantías

- Consulta de una sola fila (`WHERE status = 'PUBLISHED'`, resuelta por el
  índice único parcial `one_published_event`) — no hay ambigüedad posible
  sobre cuál es "el" evento vigente.
- `serverTime` se calcula en el momento de construir la respuesta, no se
  cachea ni se reutiliza entre peticiones.

---

## `GET /api/v1/events` · `GET /api/v1/events/:id` · `PATCH /api/v1/events/:id` · `POST /api/v1/events/:id/image`

Panel de administración del Evento (RF-203, aplicado a la configuración
general).

**Autorización:** rol `ADMIN` en las cuatro rutas.

`GET /events` — lista (en la práctica, una fila) incluyendo estado `DRAFT`,
para que el admin pueda preparar la publicación antes de que el sitio la
muestre. `GET /events/:id` — detalle.

`PATCH /events/:id` — acepta cualquier campo editable (`name`, `tagline`,
`startsAt`, `venue`, `capacity`, `status`). Es la operación detrás del caso
límite "se cancela o reprograma el evento": basta con cambiar `startsAt`.

| Código | `error` | Cuándo |
|---|---|---|
| `404` | `NOT_FOUND` | El id no existe. |
| `409` | `ANOTHER_EVENT_ALREADY_PUBLISHED` | Se intenta poner `status: "PUBLISHED"` mientras ya existe otra fila publicada (violación de `one_published_event`, traducida a un error explicativo en vez del error crudo de PostgreSQL). |

`POST /events/:id/image` — `multipart/form-data`, mismo patrón de validación
que el avatar de `001/profiles` (`file-type`, allowlist, sin confiar en la
extensión). Respuesta `200`: `{ imageUrl }`.

| Código | `error` | Cuándo |
|---|---|---|
| `422` | `INVALID_IMAGE` | El archivo no es una imagen válida en un formato admitido. |
| `413` | `FILE_TOO_LARGE` | Excede el tamaño máximo configurado. |

No existe `POST /events` (creación) ni `DELETE /events/:id`: la fila se
provee por semilla (`data-model.md` §6) y el spec solo describe editar el
evento existente, nunca crear uno nuevo ni eliminarlo.
