# ADR-012: En Vivo event-scoped y separado del motor de puntos

- Estado: Aceptada
- Fecha: 2026-10-23

## Contexto

Innovation Week y TEDx mantienen una experiencia editorial "En Vivo" con actividades, un interruptor por evento, destacada manual o por horario, quizzes y medios. `Activity` pertenece al motor de check-in y puntos: reutilizarla acoplaria el contenido editorial a asistencias y al ledger.

## Decision

- Crear `EventLiveSettings` y `EventLiveActivity`, propiedad de un evento. La actividad puede enlazar una fila de `EventProgramItem` solo del mismo evento.
- Persistir preguntas, opciones y medios en entidades propias. Medios persistidos son referencias HTTPS (con imagen de portada opcional); blobs locales de IndexedDB siguen siendo solo modo de demostracion mientras no se suban por un proveedor configurado.
- Resolver activacion con zona horaria del timestamp y limites `[startsAt, endsAt)`. `schedule`, `active` e `inactive` son overrides independientes del estado editorial `DRAFT`, `PUBLISHED` o `CANCELLED`.
- El ajuste manual solo admite una actividad publicada del mismo evento. Si no hay override, se selecciona una actividad manual activa, luego una actividad vigente por horario y finalmente la proxima actividad no inactiva.
- `GET /public/live` entrega elementos publicados y nunca expone `correctOptionId`; administracion autenticada puede leer y modificar la clave.
- Administrar requiere bearer, rol `ADMIN` y `EventAccessGuard`. La clave de evento se resuelve en servidor; claves foraneas compuestas preservan el aislamiento incluso ante IDs cruzados.

## Consecuencias

El estado y el contenido se pueden editar independientemente por evento. Las preguntas se pueden presentar publicamente sin revelar respuestas. El almacenamiento de archivos binarios requiere configurar Blob o un proveedor equivalente antes de sustituir los drafts locales; las URLs HTTPS funcionan de inmediato.
