# Propuesta: llamado de lista con NFC en eventos

**Estado:** propuesta técnica, pendiente de inventariar el modelo físico de las tarjetas y de confirmar el nivel de garantía requerido. No forma parte todavía del contrato API ni de una migración.

## Objetivo

Permitir que una persona abra TEDxUCB o Semana FCEF al acercar una tarjeta NFC, inicie sesión con la identidad compartida si es necesario, revise el evento y confirme explícitamente su asistencia. La asistencia y la lista deben quedar aisladas por evento.

### Suposiciones para el diseño

- Las tarjetas se colocan en los accesos y pueden ser utilizadas por muchas personas; no son credenciales personales asignadas a un usuario.
- Cada tarjeta queda asociada a un solo evento y abre el dominio de ese evento.
- La asistencia es al evento completo; no es check-in a una actividad ni otorga puntos.
- Se exige identidad ACTIVE con acceso al evento. La regla actual de dominio UCB/whitelist sigue aplicando.

Si las tarjetas se entregan individualmente a cada asistente, debe revisarse el ciclo de vida del token antes de implementar: en ese caso se puede emitir una credencial por persona y consumirla una sola vez.

## Inventario de capacidades NFC

El modelo exacto de las tarjetas disponibles aún no está confirmado. Antes de programarlas, leer una tarjeta de muestra y registrar fabricante, tipo de chip, UID, capacidad, estado de bloqueo, NDEF actual y disponibilidad/comportamiento del contador. No provisionar el lote hasta completar esa comprobación.

| Perfil | Capacidades útiles | Qué demuestra el servidor | Límite |
|---|---|---|---|
| NDEF estático o tarjeta antigua sin contador verificable | URL fija por evento | Que alguien abrió una URL registrada y completó login/confirmación | No prueba que haya ocurrido una lectura NFC reciente; el enlace puede copiarse y abrirse desde cualquier lugar. |
| NTAG21x con UID/contador reflejados en NDEF | UID y contador NFC de 24 bits pueden incluirse en la lectura/URL | Que la combinación tarjeta/contador registrada no se había consumido antes | El contador hace variar los datos, pero el payload no trae la MAC SUN de NTAG 424. No debe tratarse como prueba criptográfica contra falsificación o relay. Aceptar saltos de contador y rechazar solo repeticiones; un contador continuo puede fallar por lecturas repetidas del teléfono. |
| NTAG 424 DNA con SUN/SDM | Datos por lectura y mensaje de autenticación AES-128 | Autenticidad/integridad del mensaje emitido por la tarjeta y control de replay por contador | Requiere provisionamiento seguro, claves por tarjeta y validar compatibilidad real de teléfonos/navegadores. |

NXP documenta para NTAG21x el espejo ASCII de UID/contador y el contador automático; NTAG 424 DNA añade SUN/SDM autenticado. Fuentes: [NTAG213/215/216](https://www.nxp.com/products/NTAG213_215_216?tab=Documentation_Tab), [ficha técnica NTAG21x](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf), [NTAG 424 DNA](https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf) y [nota SUN/SDM](https://www.nxp.com/docs/en/application-note/AN12196.pdf).

**Decisión de seguridad propuesta:** soportar tarjetas legacy para el piloto como factor de conveniencia y anti-replay limitado, presentando esa garantía con claridad. Si la asistencia requiere prueba sólida de tarjeta original, usar NTAG 424 DNA o registrar la asistencia mediante confirmación presencial de staff. No llamar “seguro” a UID/contador sin MAC.

## Encaje con la plataforma actual

El modelo existente `Attendance` está ligado a `Activity` y `StudentProfile`; el check-in actual puede otorgar puntos. Por ello, no se debe reutilizar para el llamado general ni relajar sus constraints. La integración añadirá un módulo de asistencia al evento, vinculado a `Event` y `User`, sin escribir en `Attendance`, `PointTransaction` ni exigir perfil estudiantil.

Los dominios ya enrutan `/api/v1/*` al backend compartido. Las tarjetas apuntarán a una ruta web del evento, por ejemplo `/asistencia/nfc`, en `tedxucb.sis-ucb.site` o `semana-fcef.sis-ucb.site`; no hace falta crear un dominio, puerto o contenedor adicional. La ruta de cada host y el registro backend de cada tag deben concordar. CORS debe conservar los dos orígenes exactos.

## Flujo

1. Una tarjeta habilitada abre la ruta NFC del frontend asignado. La URL contiene solo los datos que el perfil de chip necesita transmitir.
2. El frontend remueve los parámetros de lectura del historial con `replaceState` y envía la lectura al backend por `POST`; ningún `GET` registra asistencia.
3. El backend resuelve el tag en su registro, comprueba que está activo y que pertenece al evento del host. Valida el contador/uso único; si la tarjeta soporta SUN, verifica también MAC y contador con el perfil de clave correcto.
4. El backend crea una intención de confirmación opaca, con expiración corta y estado pendiente. La intención no es una asistencia ni puede confirmar más de una vez.
5. El usuario inicia sesión con Google si no tiene sesión. Se requiere cuenta activa, apodo completo y acceso concedido al evento. El frontend mantiene la intención durante el onboarding.
6. La pantalla identifica el evento y ofrece **Confirmar asistencia**. El `POST` autenticado consume la intención y crea una única fila de asistencia dentro de una transacción.
7. Un segundo envío de la misma intención responde como repetición, y una segunda tarjeta/intención para el mismo usuario/evento devuelve el registro existente sin duplicarlo.

La intención sugerida dura 10 minutos, configurable para el evento. Las lecturas válidas pueden tener saltos de contador; nunca inferir asistencia ni consumir tokens por una visita de enlace o preview. Para tarjetas legacy sin contador, el server-minted intent es de un solo uso, pero la URL pública puede volver a abrirse: eso sigue siendo un límite de garantía, no una nueva autenticación NFC.

## Modelo de datos propuesto

- `NfcTag`: `id`, `eventId`, `publicTagKeyHash`, `hardwareProfile`, `keyVersion` (si aplica), estado, datos mínimos de provisionamiento y timestamps de activación/revocación. No persistir UID en claro si basta un HMAC de búsqueda. Claves secretas no van en frontend, repositorio ni logs.
- `NfcScanIntent`: `id`, `tagId`, contador/captura normalizados, hash de intención, estado (`PENDING`, `CONFIRMED`, `EXPIRED`), `expiresAt`, `consumedAt` y usuario confirmado. Unicidad por `tagId + counter` en perfiles con contador; intención opaca única en todos los perfiles. No persistir MAC ni token de URL innecesariamente.
- `EventAttendance`: `id`, `eventId`, `userId`, `method`, `tagId` nullable, `checkedInAt`. Unicidad `(eventId, userId)` y FK al mismo evento/tag. No copiar campos de `StudentProfile`.

Revisar constraints compuestas y estrategia de cifrado/rotación de claves en la especificación formal antes de migrar. Si se elige SUN, no reutilizar `QR_TOKEN_SECRET`: son funciones y claves con propósito distinto.

## API y permisos propuestos

- `POST /nfc/scan-intents`: entrada pública con límite de frecuencia para normalizar/validar la lectura y crear una intención pendiente. No devuelve PII ni detalles internos del tag.
- `POST /nfc/scan-intents/confirm`: Bearer de usuario autenticado; exige cuenta ACTIVE, apodo y `EventAccessService` para el evento resuelto por el tag.
- `GET /admin/event-attendance?eventSlug=...`: ADMIN, filtro/paginación por evento, devuelve solo la lista autorizada a ese evento.
- Altas/revocaciones de tarjetas quedan ADMIN-only y scoped por evento; para el MVP puede ser un comando de provisionamiento controlado, sin UI de escritura.

Las rutas finales deben pasar por Swagger/OpenAPI y por el guard de evento existente. Un `eventSlug` del navegador no puede cambiar el evento asignado al tag.

## Pruebas y criterios de aceptación

- Fixtures de payload para cada perfil; MAC inválida, UID desconocido, tarjeta revocada y contador repetido se rechazan.
- Primer `POST` produce una intención; `GET`, carga de página, preview y fallo de frontend no producen asistencia.
- Confirmar requiere sesión, apodo y acceso válido; whitelist revocada o evento distinto no registra.
- Login Google durante el flujo conserva la intención hasta expirar; una intención vencida no registra.
- Dos confirmaciones concurrentes de un tag/contador generan como máximo una asistencia; dos tags del mismo evento tampoco duplican usuario.
- Tag de TEDx no puede confirmar en Semana FCEF ni aparecer en la lista administrativa del otro evento.
- Asistencia general no escribe en `attendances` de actividad ni crea movimientos en `point_transactions`.
- El frontend mantiene la página y muestra errores recuperables sin backend; ambos dominios resuelven el slug exclusivamente desde el tag/backend.
- Probar lectura repetida con el modelo real en Android y iPhone; verificar URL, navegador y comportamiento del contador antes de provisionar lote.

Todas las pruebas de migración y contratos se ejecutan con PostgreSQL de test local/efímero. No aplicar migraciones experimentales a Supabase productivo.

## Etapas de implementación

1. **Inventario físico:** identificar chip y probar contador/NDEF con una tarjeta de muestra; registrar los límites observados.
2. **Contrato/amenazas:** fijar el perfil legacy o SUN, un tag compartido o personal, duración de intención y nivel de garantía. Actualizar spec, modelo y Swagger.
3. **Persistencia:** migración aditiva para tags, intents y asistencia general; ensayar rollback y constraints en Postgres local.
4. **Servicio NFC:** parser por perfil, integridad/replay, rate limits, transacción de consumo y errores tipados. Añadir fixtures de proveedor, incluyendo vectores conocidos si hay SUN.
5. **Frontend TEDx + Semana:** ruta de lectura, espera de sesión/apodo, botón de confirmación, retorno tras Google, estados de expiración y errores; no tocar el flujo de avatar 2D.
6. **Lista administrativa:** consulta/export por evento, sin capacidad de mutar asistencias en el MVP salvo que se apruebe una corrección manual separada.
7. **Piloto físico:** pocas tarjetas y asistentes, comparación de lecturas/contadores, pruebas de reenvío/replay y documentación de soporte; ampliar el lote solo tras aprobar el nivel de garantía.
8. **Despliegue:** añadir variables de clave solo si se usa SUN y gestionarlas como secretos; migrar la base PostgreSQL aislada con backup y rollback. DNS actual habilita la ruta pública, pero no es requisito para desarrollar el flujo local.

## Pendiente antes de cerrar la especificación

- Modelo exacto de las tarjetas disponibles y resultado de lectura de una muestra.
- Si habrá un tag de acceso compartido por evento o tarjetas asignadas a cada asistente.
- Si una asistencia NFC de baja garantía basta para la lista o requiere la validación presencial de staff/NTAG 424 DNA.
- Quién puede ver/exportar la lista, plazo de retención y si se requiere corrección manual de duplicados.
