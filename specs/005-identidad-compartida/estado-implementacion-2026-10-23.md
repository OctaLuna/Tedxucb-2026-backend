# Estado de implementacion â€” 23 de octubre de 2026

## Alcance funcional ya implementado

- Identidad compartida Google con nonce de un solo uso, validacion del ID token, asociacion por `provider + subject` y preservacion del estado/roles de cuentas previas.
- Acceso institucional automatico solo para `@ucb.edu.bo` con `hd=ucb.edu.bo`. Otros dominios requieren permiso vigente por correo; Google Workspace externo puede acreditar su dominio, y los demas correos usan enlace de prueba de titularidad de un solo uso con expiracion de tres dias.
- Apodo global con normalizacion NFKC, restriccion alfanumerica y unicidad compartida.
- Whitelist administrable con scopes TEDxUCB e Innovation Week, por defecto ambos, reemplazo atomico y revocacion.
- Invitaciones basicas a correos previamente autorizados. Consumir la invitacion no crea cuenta ni concede permisos por si mismo.
- Innovation Week consulta `/me/events` y bloquea en la interfaz las vistas privadas cuando falta el scope. Registro permite apodo y ofrece el editor 2D opcional. Firebase ya no aparece en fuentes, dependencias ni variables locales de frontend.
- El admin de Innovation Week puede asignar scopes, revocar acceso y enviar invitaciones; los enlaces se retiran del fragmento de URL antes de mostrarse y se consumen contra el backend.
- TEDx ya usa el mismo backend para login GIS, renovacion de sesion, apodo global, scopes de evento y cierre de sesion; desaparecio el acceso de demo y sus roles simulados.
- El perfil TEDx bloquea `En Vivo` y Administracion hasta contar con apodo y scope `tedxucb`. Los enlaces de verificacion externa e invitacion se consumen con sus contratos backend.
- `GET /me/events` devuelve eventos publicados permitidos: todos para correo institucional UCB y solo los autorizados para correo externo. TEDx usa esta respuesta para decidir el acceso local.
- TEDx Oradores consulta `/public/speakers?eventSlug=tedxucb` y ya no toma su lista de datos de muestra como fuente. La agenda y el administrador de contenido siguen pendientes de contrato/integracion.

## Verificacion local

- Backend: build `nest build` exitoso; `git diff --check` limpio. `GET /me/events` pasa seis pruebas de contrato, incluyendo whitelist por evento y acceso institucional.
- PostgreSQL/Redis aislados: seis suites de contrato/integracion, 43 pruebas aprobadas. Cubren Google, estados de cuenta, nonce, invitaciones, pruebas de correo, nickname, whitelist y restricciones relacionales. Sin Google ni SMTP reales.
- Frontend Innovation Week: build, lint y 29 pruebas aprobados en el ciclo anterior.
- Frontend TEDx: build de produccion, TypeScript, ESLint focalizado y `git diff --check` aprobados. HTTP local sirve la pagina; health, challenge Google y CORS de TEDx pasan smoke checks.
- Servicios locales activos: API `http://localhost:3100`, TEDx `http://localhost:3000`, Innovation Week `http://localhost:5173`; Avatar 2D estaba disponible en `localhost:5175` en el ciclo anterior. El test DB local tiene publicados los slugs `tedxucb` e `innovation-week`.
- Los cambios de esquema solo se aplicaron en `127.0.0.1:55432/ted_integration_test`. No se modifico Supabase.

## Trabajo pendiente antes de afirmar que la integracion global esta completa

1. **Separacion real de datos por evento (bloqueante):** los modelos heredados de contenido, speakers, actividades, asistencias, puntos y selecciones siguen globales o tienen solo parte del scope. `GET /public/event` sigue usando el unico evento publicado globalmente. No publicar Innovation Week con esos endpoints: podria exponer o mezclar datos TEDx. Completar event context, `eventId`, backfill TEDx verificado, restricciones compuestas y pruebas cruzadas antes de habilitar recursos privados.
2. **Conectar el dominio del frontend:** agenda, speakers, chat/comunidad, estado en vivo y administracion de contenido de Innovation Week todavia usan mocks/localStorage/IndexedDB. Solo identidad y permisos consumen el backend hoy. Definir contratos event-scoped y reemplazar esas fuentes una por una con estados de carga/error y pruebas.
3. **OAuth real:** falta un `GOOGLE_CLIENT_ID` valido; el frontend local lo deja vacio intencionalmente y el servidor de desarrollo usa un ID de fixture. No se puede completar una autenticacion real hasta configurar el proyecto Google, origen autorizado y consentimiento en un entorno aprobado.
4. **Correo real:** SMTP/QStash de staging no fue probado. Las pruebas interceptaron `MailService.send`; configurar proveedor/buzon de prueba y revisar links/entrega al preparar staging.
5. **Avatar 2D:** el editor opcional conserva actualmente la referencia de forma local/anonima. Falta vincular propietario y referencia con la identidad backend, migrar referencias invitadas con consentimiento y validar recuperacion entre dispositivos.
6. **Segundo frontend TEDx:** la identidad/scope esta conectada; falta revisar navegacion tras sesion y flujos visuales en navegador y reemplazar contenido/administracion local por endpoints compartidos.
7. **Release:** revisar auditoria diferida, CORS por origen real, secretos y migracion con plan de backfill/rollback. Ningun cambio de produccion/Supabase se considera aplicado.

## Configuracion de desarrollo

La API local usa PostgreSQL aislado `ted_backend_local`, separado de `ted_integration_test`, Redis local DB 1 y puerto 3100 (`npm run start:local`). CORS admite `http://localhost:3000` y `http://localhost:5173`. Innovation Week conserva `.env.local` ignorado por Git con `VITE_API_BASE_URL=http://localhost:3100/api/v1`; TEDx usa `.env.local` ignorado por Git con `NEXT_PUBLIC_API_BASE_URL=http://localhost:3100/api/v1`. No copiar credenciales a archivos versionados. Para habilitar GIS real, completar `VITE_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_ID` con el client ID del entorno de desarrollo autorizado; actualmente solo se verifico el challenge backend con un ID de fixture.

## Incidente de base remota â€” 23 de octubre de 2026

- Una ejecuciÃ³n de `prisma migrate deploy` tomÃ³ `DIRECT_URL` desde `.env`, que apuntaba al proyecto Supabase remoto. Las migraciones `20261023000000` a `20261023050000` aparecen aplicadas en la tabla de migraciones remota. La `20261023060000` fallÃ³ al inicio por un BOM UTF-8 y su primera sentencia no llegÃ³ a ejecutarse.
- Una suite de contrato se iniciÃ³ despuÃ©s sin sobreescribir `DATABASE_URL`; los helpers de prueba ejecutan `TRUNCATE ... CASCADE` antes de cada caso. Se interrumpiÃ³ al detectar el destino remoto. Una consulta posterior, en transacciÃ³n `READ ONLY`, confirmÃ³ conteo cero en `events`, `content_blocks`, `users`, `user_roles`, `speaker_applications`, `speakers`, `student_profiles`, `attendances`, `point_transactions`, `selection_runs` y `selections`. Se perdieron los registros productivos de esas tablas.
- El esquema remoto tambiÃ©n recibiÃ³: columnas `users.nickname` y `users.nickname_key` con unicidad; `event_email_access`; ampliaciÃ³n del constraint `registration_source`; tablas `user_identities`, `external_email_proofs` e `identity_invitations`; `content_blocks.event_id` con backfill; eliminaciÃ³n del Ã­ndice `one_published_event`; y la columna `events.slug` con backfill de TEDx.
- No se hizo ningÃºn otro intento de escritura en Supabase. Las migraciones posteriores se ejecutaron solo en `127.0.0.1:55432/ted_integration_test`. El build local pasÃ³. Una validaciÃ³n de contratos se interrumpiÃ³ antes de disponer de resultado concluyente.
- No se encontrÃ³ un dump local ni una credencial de Management API entre las variables inspeccionadas. RecuperaciÃ³n requiere que el propietario restaure Supabase desde un backup/PITR previo al incidente. Elegir un punto anterior al primer cambio remoto de hoy; la ventana estimada mÃ¡s segura es antes de las 07:14 de La Paz (11:14 UTC). Revisar con el propietario si existen escrituras legÃ­timas posteriores que deban conservarse. La documentaciÃ³n oficial describe el flujo en [Database Backups](https://supabase.com/docs/guides/platform/backups).
- Se aÃ±adiÃ³ una barrera al cliente de pruebas para rechazar hosts de base no locales. No reanudar las pruebas ni desplegar migraciones en Supabase hasta recuperar y validar la base.

## Avance de aislamiento por evento (23 de octubre de 2026)

- Se añadieron `eventId` y constraints por evento a `Selection`; las asignaciones manuales y de ranking ahora comparten pertenencia, la unicidad activa permite una selección por alumno y evento, y ejecución, revocación, entrada, conteo y CSV filtran por `eventSlug`.
- El ledger `point_transactions` permanece append-only: `point_transaction_event_ownership` añade la pertenencia como metadata inmutable, sin UPDATE a transacciones existentes. Un trigger asigna el evento autorizado y mantiene `event_student_points` en la misma transacción, con el truncamiento a cero del ledger. La reconciliación detecta/repara esa proyección y deja auditoría.
- Historial, ranking, progreso, ajustes/reversiones y selección consumen el saldo del evento. El check-in confirma que el alumno tiene permiso para el evento de la actividad.
- Listado, detalle y exportación administrativa de perfiles requieren scope del evento y solo exponen perfiles institucionales Google verificados o externos presentes en la whitelist activa. El saldo mostrado es el del evento.
- Se registró `innovation-week` con metadata existente del frontend (fecha 7–11 de septiembre de 2026, sede UCB) mediante migración idempotente y seed; las migraciones nuevas se aplicaron exclusivamente a las bases locales `ted_integration_test` y `ted_backend_local`.
- Verificación adicional: 10 suites de contrato/integración de puntos, ranking, selección y scope aprobaron 52/52; el flujo de conciliación aprobó 1/1; perfiles administrativos aprobaron 7/7. La suite del check-in aprobó sus casos existentes, incluyendo la nueva denegación si un alumno externo no tiene acceso al evento de la actividad.

### Pendientes globales

La integración funcional todavía no está cerrada: falta terminar la matriz de endpoints/modelos y publicar OpenAPI actualizado; conectar administración de agenda/speakers y estado en vivo con contratos persistidos (hoy hay datos locales sin modelo backend para parte del estado); probar navegación y registro real cuando exista un Google OAuth Client ID válido; verificar SMTP/entrega de correo; implementar propiedad recuperable y vínculo autenticado del avatar 2D; revisar ambos frontends de extremo a extremo. No se ejecutaron migraciones contra Supabase.


---
CURRENT STATUS NOTE (2026-10-23): This file is a historical snapshot. The latest verified status is in avance-integracion-2026-10-23.md and the reconciliation appended to plan.md. Several pending items above were completed later (event scope, frontend, Avatar 2D); the remaining release gates are real Google OAuth, external SMTP, and deployment to an isolated staging database. Never repeat the historical Supabase operations described above.
