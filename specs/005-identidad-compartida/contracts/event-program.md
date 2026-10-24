# Contrato: programa publico por evento

## Modelo

`EventProgramItem` representa agenda editorial (apertura, charla, pausa, performance, cierre u otro). No representa una actividad de check-in ni otorga puntos. Cada registro tiene un `eventId`, rango horario, orden, estado y speaker opcional. La FK compuesta `(speaker_id, event_id)` impide asociar un speaker de otro evento. Se conserva el historial con estado `CANCELLED` en vez de borrar.

Tipos admitidos: `OPENING`, `TALK`, `BREAK`, `PERFORMANCE`, `CLOSING`, `OTHER`. Estados: `DRAFT`, `PUBLISHED`, `CANCELLED`. `endsAt` debe ser posterior a `startsAt`; `title` no puede quedar vacio al normalizar espacios; `displayOrder` no es negativo.

## Rutas

### Publicas

- `GET /api/v1/public/program?eventSlug=tedxucb`
- `GET /api/v1/public/program?eventSlug=innovation-week`

Respuesta `200`:

```json
{
  "data": [
    {
      "id": "uuid",
      "eventId": "uuid",
      "title": "Ideas que abren caminos",
      "description": null,
      "type": "TALK",
      "startsAt": "2026-11-02T13:00:00.000Z",
      "endsAt": "2026-11-02T13:20:00.000Z",
      "displayOrder": 0,
      "status": "PUBLISHED",
      "speaker": null
    }
  ]
}
```

Solo devuelve filas `PUBLISHED` del evento pedido, ordenadas por `displayOrder` y luego `startsAt`. Un speaker anidado solo se incluye si tambien esta `PUBLISHED`. Un evento no existente o no publicado devuelve `404 EVENT_NOT_FOUND`.

### Administracion

`ADMIN` activo con acceso al evento:

- `GET /api/v1/event-program?eventSlug=tedxucb&status=DRAFT`
- `POST /api/v1/event-program?eventSlug=tedxucb`
- `PATCH /api/v1/event-program/{id}?eventSlug=tedxucb`

La autenticacion requiere bearer. `EventAccessGuard` valida el scope solicitado; los controles del cliente no son autorizacion. `POST` acepta `title`, `type`, `startsAt`, `endsAt`, y opcionalmente `description`, `speakerId`, `displayOrder`, `status`. El estado por omision es `DRAFT`. `PATCH` acepta esos mismos campos opcionales. Para publicar una charla asociada, el speaker tambien debe pertenecer al mismo evento y estar publicado.

Errores estables: `401` sin sesion, `403` sin rol/scope, `404 EVENT_NOT_FOUND` evento inexistente/no publicable, `404 NOT_FOUND` elemento fuera de ese evento, `422 INVALID_SPEAKER`, `422 SPEAKER_NOT_PUBLISHED`, `422 INVALID_TIME_RANGE` o `422 INVALID_TITLE`.

La API no acepta `eventId` en el body: el contexto se deriva del `eventSlug` validado en servidor y se escribe junto con el elemento.
