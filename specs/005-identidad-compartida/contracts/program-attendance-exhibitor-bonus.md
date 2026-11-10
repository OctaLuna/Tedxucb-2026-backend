# Contrato: enlace NFC de asistencia de expositor

## Alcance

Para cada `EventProgramItem` publicado de Innovation Week habrá dos enlaces independientes: `ATTENDANCE` (el actual) y `EXHIBITOR`. Ambos registran la asistencia única del usuario a la charla; el segundo añade un bono de 15 puntos BizWeek. Los puntos base de la actividad vinculada siguen aplicándose según la lógica actual.

El enlace identifica charla y modalidad, admite uso repetido por distintas cuentas y permanece activo hasta que un administrador lo regenere o revoque. La regeneración o revocación de una modalidad no afecta a la otra.

## Administración de enlaces

### `POST /api/v1/event-program/{id}/attendance-link?eventSlug=innovation-week`

Autorización: `ADMIN` activo con acceso al evento. El body es opcional; `{ "kind": "EXHIBITOR" }` crea el enlace de expositor. Sin body o con `{ "kind": "ATTENDANCE" }` conserva el comportamiento normal existente.

Respuesta `201`:

```json
{ "data": { "id": "uuid", "token": "token-opaco", "kind": "EXHIBITOR", "createdAt": "2026-11-10T16:30:00Z" } }
```

Solo se devuelve el token al generarlo. En la base se persiste su hash. Una nueva generación revoca solo el enlace activo del mismo `kind` y reemplaza su token.

### `DELETE /api/v1/event-program/{id}/attendance-link?eventSlug=innovation-week&kind=EXHIBITOR`

Revoca solo la modalidad indicada. Si se omite `kind`, revoca el enlace `ATTENDANCE` por compatibilidad. Es idempotente.

### `GET /api/v1/event-program/{id}/attendance?eventSlug=innovation-week`

Devuelve `links.attendance` y `links.exhibitor`, cada uno con `active` y `createdAt`. Conserva `link` como alias de `links.attendance` durante la compatibilidad con clientes existentes.

Errores: `401` sin sesión; `403` sin rol o scope de evento; `404 PROGRAM_ITEM_NOT_FOUND` para un elemento fuera del evento; `404 PROGRAM_ITEM_NOT_AVAILABLE` para un elemento no publicado; `400 INVALID_ATTENDANCE_LINK_KIND` para un tipo no admitido.

## Previsualización y confirmación

El flujo de sesión, ruta y token NFC existente no cambia.

`POST /api/v1/me/program-attendance/preview` informa `kind`, `bonusPoints` (15 para `EXHIBITOR`, 0 para `ATTENDANCE`) y si el bono de expositor ya fue otorgado al usuario para esa charla. Previsualizar nunca escribe asistencia ni puntos.

`PUT /api/v1/me/program-attendance` confirma la asistencia. Para `EXHIBITOR`, inserta el movimiento `BONUS` de +15 en el ledger BizWeek dentro de la misma transacción que confirma la asistencia y los puntos base aplicables. El motivo identifica charla y bono de expositor. `bonusPointsAwarded` es 15 solo en la primera concesión y 0 en los reintentos; `newTotal` incluye ambos movimientos.

La clave de idempotencia del bono la deriva el servidor a partir del usuario y el `EventProgramItem`. Reusar el enlace o confirmar después de una asistencia normal nunca duplica el bono. Si el usuario confirma primero por el enlace normal y luego por el de expositor, se conserva una sola asistencia y se otorga una sola vez el bono extra.

## Aceptación

- Los enlaces normal y expositor permanecen activos a la vez y pueden revocarse o regenerarse por separado.
- Enlace normal: conserva exactamente el puntaje base actual y no emite bono.
- Enlace de expositor: emite +15 además del puntaje base y muestra modalidad/bono en previsualización y resultado.
- Repetir el enlace expositor o enviar confirmaciones simultáneas no duplica ni los puntos base ni el bono.
- Escanear el enlace de expositor después del normal conserva la asistencia existente y añade el bono una sola vez.
- El ledger, el total global, la proyección del evento y el historial reflejan el mismo total.
- Un usuario sin acceso al evento y un administrador sin acceso al evento no pueden consultar o mutar la integración.
