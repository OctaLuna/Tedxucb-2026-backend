# Contrato: En Vivo por evento

En Vivo es contenido editorial; no representa check-in, asistencia ni puntos.

## Lectura publica

`GET /api/v1/public/live?eventSlug=tedxucb`

Devuelve `enabled`, `featuredActivity` y `activities` publicados del evento. Un `featuredActivity` se resuelve con el interruptor del evento, el override manual, activationMode y rango horario `[startsAt, endsAt)`. Quiz público entrega prompt y opciones, nunca `correctOptionId`. Medios son enlaces HTTPS validados.

## Administracion

Requiere bearer, rol `ADMIN` y acceso al slug solicitado.

- `GET /api/v1/event-live?eventSlug=tedxucb`: settings y todas las actividades, incluidos borradores.
- `PUT /api/v1/event-live?eventSlug=tedxucb`: habilitar/deshabilitar, seleccionar o limpiar el override manual.
- `POST /api/v1/event-live/activities?eventSlug=tedxucb`: crear actividad con preguntas y medios opcionales.
- `PATCH /api/v1/event-live/activities/{id}?eventSlug=tedxucb`: actualizar actividad/preguntas/medios.
- `DELETE /api/v1/event-live/activities/{id}?eventSlug=tedxucb`: transiciona a `CANCELLED`, conserva historial y limpia override si corresponde.

Estados editoriales: `DRAFT`, `PUBLISHED`, `CANCELLED`. Activation mode: `schedule`, `active`, `inactive`. Fechas ISO; el fin debe ser posterior al inicio. Las preguntas requieren prompt, 2–6 opciones distintas, una opcion correcta valida, 5–120 segundos y puntos no negativos. El endpoint publico omite la respuesta correcta incluso para elementos publicados.

Media: `image`, `video` o `resource`, URL HTTPS, nombre limitado; `coverUrl` opcional solo para video/recurso. Los IDs de actividad o programa deben pertenecer al mismo evento; no se acepta `eventId` en el body.
