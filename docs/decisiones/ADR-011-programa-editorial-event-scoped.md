# ADR-011: separar el programa editorial de las actividades de check-in

- Estado: aceptada para la integracion local
- Fecha: 2026-10-23
- Contexto: el cronograma de TEDx debe ser editable por administracion y consultable por ambos eventos. `Activity` otorga puntos y controla asistencia/check-in. El modelo no representa charlas, pausas o aperturas y no debe reutilizarse para ello.

## Decision

Crear `EventProgramItem` como entidad editorial propia, con `eventId`, tipo, titulo, descripcion, inicio, fin, orden, estado y speaker opcional. El servidor resuelve el evento por slug, impone acceso event-scoped en operaciones administrativas y mantiene filas canceladas para historial. La clave foranea compuesta hacia `(Speaker.id, Speaker.eventId)` evita asociaciones entre eventos.

Publicar solo elementos `PUBLISHED` de un evento publicado. La API incluye datos minimos del speaker solo si este tambien esta publicado. El estado del programa se calcula en el cliente desde los timestamps de servidor y no se persiste como `LIVE`.

## Consecuencias

- La migracion es aditiva y crea una tabla nueva; no reescribe agenda, actividades, puntos ni speakers existentes.
- OpenAPI publica lectura publica y CRUD administrativo de programa.
- Un admin no puede crear o cambiar elementos fuera de su evento. El `eventId` lo decide el backend.
- Los frontends pueden usar el mismo contrato con slugs distintos sin compartir filas.
- La administracion de En Vivo, quizzes y medios sigue separada: no pertenece a este modelo editorial.

## Validacion

`specs/005-identidad-compartida/contracts/event-program.md` y `tests/contract/event-program.contract.spec.ts` cubren aislamiento, permisos, drafts y asociaciones de speaker. La migracion se aplica solo a PostgreSQL local aislado durante esta etapa.
