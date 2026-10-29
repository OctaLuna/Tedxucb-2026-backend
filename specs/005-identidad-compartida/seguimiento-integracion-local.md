# Seguimiento local de integración (23 de octubre de 2026)

Esta nota complementa el SDD de identidad compartida. No declara completa la integración ni habilita cambios en Supabase productivo.

## Cambios de esta iteración

- El Client ID Web de pruebas está configurado en los archivos locales ignorados por Git del backend, Innovation Week y TEDx. El mismo ID se usa en los tres procesos; no se copia a manifests versionados.
- El backend local emite desafíos Google con CORS exacto para `http://localhost:3000` y `http://localhost:5173`.
- Innovation Week renueva tokens por generación de sesión y refresh token. Respuestas antiguas no pueden sobrescribir una sesión nueva.
- Check-in exige que el staff conserve acceso al evento además de la asignación a la actividad. Revocar el acceso bloquea una asignación todavía existente.
- Los E2E de actividades siembran el evento después de truncar las tablas para evitar continuar con IDs vacíos.
- Se inventariaron los 34 modelos Prisma y su alcance global, raíz de evento, scoped o derivado en `matriz-alcance-modelos.md`.

## Verificaciones

- Innovation Week: `npm run verify` aprobó typecheck, lint, aislamiento, build y 42/42 pruebas.
- TEDx: 6/6 pruebas, typecheck y build aprobados; ESLint sin errores y dos advertencias preexistentes por elementos `<img>`.
- Backend: `npm run build` aprobó; regresión serial completa en `ted_integration_test`: 71/71 suites y 409/409 pruebas tras los cambios de autorización por evento. Contratos focalizados 21/21, flujo de puntos afectado 3/3, E2E de actividades 3/3 y entrega SMTP a Mailpit local incluida en la matriz.
- API, TEDx, Innovation Week, Avatar API y editor 2D responden HTTP 200.
- El challenge de Google responde HTTP 200 y CORS devuelve el origen solicitado en ambos frontends.
- `git diff --check` no encontró errores de whitespace; Git reportó solo avisos de normalización LF/CRLF.

## Pendiente para poder afirmar cierre

1. Completar el formulario de Google con una cuenta de prueba para comprobar callback y emisión de sesión; ambos orígenes locales ya abren la pantalla de Google sin error de origen.
2. Completar la auditoría de rutas y constraints de aislamiento; verificar contratos/constraints de consultas por evento y backfill/rollback con fixture sanitizado.
3. El envío local sí se verificó con Mailpit; probar proveedor SMTP externo y entrega a buzón real queda para la fase de servidor.
4. Mantener Supabase productivo y despliegue remoto fuera del alcance local hasta preparar la fase de servidor.



## Verificación posterior

- `GET /events` restringe su respuesta a los eventos permitidos al administrador. El contrato de scope comprueba que una cuenta con TEDx y sin Innovation Week solo reciba TEDx.
- Ajustes de puntos y asignación manual de selección comprueban el permiso del alumno objetivo; el contrato cruzado verifica 403 y ausencia de movimientos/selecciones.
- El Client ID de Google local coincide en backend, Innovation Week y TEDx; challenge y CORS responden 200 para ambos orígenes. El inicio interactivo con una cuenta real sigue sin verificarse desde navegador.
- El archivo `.env.admin.local` contiene la allowlist local y está ignorado por Git. La promoción ADMIN ocurre después de una autenticación Google válida.
## Instalación local desde una base vacía

- El ensayo de migración aislado encontró que el backfill de speakers requiere una fila TEDx previa. Se añadió `npm run migrate:local`: fija la URL en loopback y, solo si la migración de scope falla por ausencia de TEDx y todas las tablas event-scoped están vacías, crea el ancla local y reanuda el deploy. Para una base con datos, se detiene sin asignar su propiedad por conjetura.
- En `ted_migration_audit` recién creada, las 25 migraciones quedaron aplicadas, el seed se ejecutó dos veces y dejó 2 eventos, 1 admin local y 2 permisos del admin. `prisma migrate status`, `prisma validate` y `npm run build` pasaron.
- El ensayo detectó también que el seed del admin guardaba `nickname` sin `nicknameKey`; se completó la clave canónica `adminlocal` para cumplir la constraint de consistencia.
- La base temporal solo existió en el PostgreSQL local de pruebas (`127.0.0.1:55432`) y fue eliminada tras registrar la evidencia. No se ejecutaron comandos de migración contra Supabase.

## Fixture reproducible de migración con datos legacy

- `npm run test:migrations:local` crea y elimina una base temporal `ted_migration_fixture_*` únicamente en loopback `127.0.0.1:55432`; rechaza cualquier host, puerto o nombre de base fuera de esa frontera.
- Resultado del 23 de octubre de 2026: `pg_dump -Fc` exportó el fixture legacy sintético y `pg_restore` lo cargó en una segunda base aislada. Conteos, relaciones, suma/hash de ledger coincidieron antes de migrar; tras aplicar las 25 migraciones se conservaron las dos transacciones, sus 13 puntos y ownership, 7 filas scoped asignadas a TEDx, cero huérfanos y constraints de unicidad/FK entre eventos. `prisma migrate status` confirmó el esquema destino al día y la base origen siguió intacta como copia de recuperación. Un segundo fixture con dos filas legacy `TEDxUCB` hizo fallar el backfill y ambas conservaron el slug nulo.
- La prueba terminó eliminando su base efímera. También se eliminó la base temporal de la auditoría manual anterior después de comprobar que contenía únicamente fixture local y 25 migraciones. No se conectó a Supabase.
- T034 queda cubierto para el fixture sintético local. Procedimiento pre-cutover: (1) generar y custodiar un dump sanitizado/backup verificado antes de DDL y registrar conteos, relaciones y agregados del ledger; (2) abortar el corte ante cualquier colisión, fila huérfana o diferencia, conservar logs y dump, y resolver explícitamente el mapeo antes de reintentar; (3) si una migración falla, no habilitar tráfico ni editar una migración ya aplicada en otro entorno: restaurar el backup en una base nueva y validar integridad; una corrección posterior debe ser una migración forward revisada y ensayada sobre otra copia; (4) antes de aceptar el corte, comparar nuevamente conteos, FKs, ownership/hash del ledger y ranking proyectado. El rollback previo al primer write post-cutover consiste en volver a la copia restaurada anterior; no se revierte ni se reescribe el ledger. Supabase productivo no se tocó.
- T031 permanece abierto: el fixture demuestra consistencia del resultado, no operación en línea con escrituras concurrentes ni ausencia de locks largos. Las migraciones actuales combinan alta nullable, backfill, `NOT NULL` y reemplazo de índices. Antes de una base compartida, se debe aprobar ventana de mantenimiento o rediseñar la secuencia aditiva/contract sobre un dump representativo y verificar compatibilidad de las versiones de aplicación.
## Popup Google en los dos orígenes locales

- Playwright abrió `/registrarse` de Innovation Week y el diálogo de acceso de TEDx. En ambos apareció el botón oficial, el backend devolvió challenge HTTP 200 y el click abrió `https://accounts.google.com/v3/signin/identifier` con título `Sign in - Google Accounts`, sin errores de origen ni errores de JavaScript.
- El navegador headless no tiene una sesión de Google y no se ingresaron credenciales. El callback de una autenticación real, la sesión backend resultante y el rol ADMIN de la cuenta configurada siguen pendientes de verificación interactiva.
## Prueba local del modo de demostracion y Avatar 2D (23 de octubre de 2026)

- Se detecto y corrigio que el perfil demo de Innovation Week intentaba pedir una credencial puente al backend para abrir el editor. Ahora el modo demo omite esa credencial y el editor conserva el flujo anonimo local; las sesiones autenticadas continuan solicitando su token puente al backend.
- Prueba de navegador real en `http://localhost:5173/registrarse`: entrar como invitado, abrir `Crear personaje` y guardar el avatar desde el iframe. Resultado: el servicio local respondio `201` al crear el invitado y guardar el avatar, el preview respondio `200`, el padre mostro `Tu personaje esta guardado.`, cero errores JavaScript y cero solicitudes locales fallidas. La prueba encontro que Chromium bloquea la captura por canvas del `foreignObject`; se sustituyo por composicion SVG directa con recursos locales embebidos.
- Innovation Week tras la correccion: typecheck, lint, 15 archivos/43 pruebas y build aprobados. `check:isolation` confirmo que el frontend no depende de implementacion ni codigo fuente del editor/avatar.
- La persistencia de invitado es local al navegador/dispositivo. Para vincular y recuperar el avatar entre sesiones se requiere autenticacion real y el token puente, que aun no se ha probado con una cuenta Google interactiva.

## Auditoria incremental: scope para invitaciones administrativas (23 de octubre de 2026)

- Se encontro que `POST /admin/identity-invitations` validaba rol ADMIN y whitelist del destinatario, pero no comprobaba si quien invitaba tenia acceso al evento solicitado. Esto permitia a un ADMIN con scope limitado iniciar invitaciones en el otro evento.
- Se movio el controlador/servicio de email a un modulo con dependencias explicitas de Auth y EventAccess. Antes de crear token o enviar correo, el backend exige ADMIN activo y acceso actual al evento destino; el scope del destinatario se mantiene como comprobacion independiente.
- Contrato de regresion: un ADMIN con TEDx activo y Innovation Week revocado recibe `403 EVENT_ACCESS_DENIED` al invitar para Innovation Week; no se persiste invitacion ni se llama a SMTP. El test conserva su permiso TEDx. Invitaciones por scope permitido y restantes casos pasan: 10/10.
- Regresion completa posterior: 71/71 suites, 410/410 pruebas; `npm run build` aprobado. Backend local reiniciado con el modulo nuevo; health, Swagger, challenge Google y CORS exacto de ambos frontends responden correctamente.
## Confirmacion de enlaces de correo en TEDx (23 de octubre de 2026)

- El frontend toma el token del fragmento antes de retirar los parametros de un solo uso y conserva cualquier otro parametro del fragmento.
- La peticion queda compartida entre los ciclos de efecto de React StrictMode para evitar consumir dos veces la invitacion o verificacion. El resultado se muestra como aviso independiente del error de acceso, por lo que abrir el modal no lo borra.
- Las pruebas de ambos enlaces se ejecutan bajo StrictMode y confirman una sola peticion, el endpoint y token esperados, la limpieza de la URL y el aviso visible. TEDx: 8/8 pruebas, typecheck y build aprobados; lint sin errores y con dos avisos preexistentes de `<img>` en `AvatarCta.tsx`.
- TEDx tambien valida en la interfaz el minimo de tres caracteres y la prohibicion de simbolos en el apodo antes de enviarlo; el guardado de un apodo valido sigue usando la misma identidad global.
## Validacion de errores de apodo y cierre de sesion entre frontends (23 de octubre de 2026)

- Innovation Week muestra el conflicto de apodo duplicado devuelto por el backend sin perder el formulario de registro; la suite completa paso a 15 archivos y 44 pruebas. `npm run verify` paso typecheck, lint, aislamiento, tests y build.
- TEDx valida minimo de 3 caracteres y charset en su modal; las pruebas verifican acceso TEDx denegado, logout incluso si Avatar API no esta disponible, y confirmacion de enlaces en StrictMode. Suite completa: 11/11; typecheck/build y lint sin errores (dos avisos preexistentes de imagen).
- La primera invocacion de prueba en Innovation Week uso pnpm por error y genero un lockfile no rastreado. Se elimino ese artefacto; la verificacion final se ejecuto desde la raiz con el `npm` workspace y lockfile declarado por el proyecto. Sin cambios en manifests/lockfiles versionados.
## Auditoria funcional de aislamiento por evento (23 de octubre de 2026)

- Inspeccion de controladores: todas las rutas privadas con `eventSlug` revisadas tienen `EventAccessGuard`; rutas publicas limitan frecuencia y pasan el slug al resolutor de evento. Las rutas administrativas por UUID aplican `EventIdAccessGuard`; check-in usa `ActivityStaffGuard`. Los contratos comprueban recursos/IDs cruzados y permisos del objetivo al asignar puntos o selecciones.
- Se ejecutaron contra `ted_integration_test` 17 suites contractuales de recursos scoped (actividades, categorias, staff, grants, postulaciones, contenido, programa, En Vivo, perfiles, speakers, puntos, ranking, seleccion, entradas y progreso): 153 pruebas. Catorce suites pasaron en la corrida conjunta; los hooks de tres suites excedieron 30 s al acumularse memoria. Repetidas en procesos aislados, `speakers` 17/17, `leaderboard` 7/7 y `event-live` 6/6 pasaron. Resultado consolidado: 17/17 suites, 153/153 pruebas aprobadas.
- Las pruebas usaron exclusivamente `127.0.0.1:55432/ted_integration_test`; no se ejecutaron migraciones y Supabase productivo no fue consultado ni modificado. La auditoria completa de constraints/backfill con datos legacy y aprobacion de riesgos de release permanece abierta.

## Fallback cuando el API responde sin contenido publicado

- Innovation Week y TEDx conservaban muestras si el fetch fallaba, pero una respuesta 200 con listas vacías reemplazaba la vista por contenido vacío. Los hooks públicos ahora usan muestras también en ese caso y muestran un aviso explícito.
- El selector de charlas del panel de Administración de Innovation Week desactiva el fallback para que nunca ofrezca IDs ficticios; no se han sembrado speakers ni agendas sin aprobación de contenido.
- Innovation Week `npm run verify`: 15/15 archivos, 47/47 pruebas, typecheck, lint, aislamiento y build aprobados. TEDx: `npm test` 4/4 archivos, 13/13 pruebas; typecheck y build aprobados, lint con los dos avisos existentes de `<img>`.
- Smoke browser: `/schedule` de Innovation Week y home TEDx devolvieron HTTP 200, contenido de muestra y aviso de fallback; cero errores JavaScript. El API había respondido HTTP 200 con cero programa y speakers TEDx.

## Allowlist administrativa local

- Se inicializo el `AppModule` con `NODE_ENV=development` y se comprobo a traves de `ConfigService` que `.env.admin.local` carga exactamente una cuenta administradora. El archivo esta ignorado por Git.
- La cuenta configurada recibe ADMIN y ambos scopes por el contrato `auth-google`; las pruebas `auth-google` e `identity-email` pasaron 22/22 en PostgreSQL local. El proceso HTTP local actual arranco antes de la ultima escritura del secreto y debe reiniciarse para recoger la version vigente; no se ejecuto login real.

## Smoke HTTP local

- Verificacion local: backend `/api/v1/health`, Innovation Week `/registrarse` y TEDx `/` respondieron HTTP 200. Las solicitudes CORS preflight al challenge Google respondieron 204 y devolvieron el origen exacto para `http://localhost:5173` y `http://localhost:3000`.

- Los `.env.local` de ambas webs apuntan a `http://localhost:3100/api/v1` y contienen el mismo Client ID web que el backend. `POST /auth/google/challenge` devolvio 200, nonce valido y CORS coincidente desde ambos origenes locales. Esto confirma configuracion y challenge, no el callback con una cuenta Google real.

## Administracion de accesos por correo

- `GET /admin/event-access` ahora acepta `email`, `status`, `page` y `limit`; devuelve metadatos y pagina correos completos para no separar los scopes de una misma persona. `limit` se valida entre 1 y 100; estados: activos, revocados o todos.
- El panel de Innovation Week incorpora busqueda, selector de estado e historial de revocaciones con paginacion. El modo demo conserva cambios locales y filtros sin llamar al backend.
- Backend: `admin-event-access.contract.spec.ts` 9/9 y `npm run build` aprobados. Innovation Week: suite 15/15 archivos, 48/48 pruebas, aislamiento y build aprobados; typecheck y lint aprobados tras eliminar el warning del componente.

## Verificacion del filtro y paginacion administrativa

- Se implemento paginacion por correo unico en backend y busqueda parcial case-insensitive; el historial permite ver permisos activos, revocados o todos. El panel presenta busqueda, estado, contador y navegacion, agrupando por email.
- Para convivir con el proceso local anterior mientras el backend no se reinicia, Innovation Week detecta respuestas sin `meta` y pagina/filtra en el cliente. Al recibir el formato nuevo, usa la paginacion del servidor. Este camino legado tiene prueba propia.
- Contrato admin-event-access: 9/9; build backend aprobado. `npm run verify` de Innovation Week: typecheck, lint, 15/15 archivos y 49/49 pruebas, aislamiento y build aprobados. El lint emite dos avisos del parser JSX de `jsx-ast-utils` sin errores ni warnings por el componente actualizado.

## Revalidacion integrada local (27 de octubre de 2026)

- La base `ted_backend_local` estaba al dia con 29 migraciones en `127.0.0.1:55432`. Se usaron PostgreSQL, Redis y Mailpit del `docker-compose.test.yml`; ninguna URL ni comando apuntó a Supabase productivo.
- Regresion backend: `npm run test:local -- --maxWorkers=1 --testTimeout=120000` — 72 suites y 422 pruebas aprobadas. Duracion: 1541.5 s.
- Innovation Week: 53/53 pruebas, typecheck, lint (exit 0; dos avisos del parser `jsx-ast-utils`), aislamiento y build de produccion aprobados.
- TEDx: 13/13 pruebas, typecheck, lint (exit 0; dos avisos preexistentes de `<img>`) y build de produccion aprobados. El servidor standalone local devolvio HTTP 200 para `/`.
- Avatar 2D: `npm run verify` aprobó typecheck, lint, 23/23 pruebas y build. El backend y Avatar comparten el secreto puente local; los origenes de ambos frontends estan permitidos. Avatar API `/ready` y editor respondieron HTTP 200.
- Smoke HTTP: backend health 200; challenge Google 200 y preflight 204 desde `localhost:5173` y `localhost:3000`; un origen externo no recibió `Access-Control-Allow-Origin`. Innovation Week `/registrarse`, TEDx `/` y ambos endpoints públicos de programa respondieron 200. El programa muestra 26 elementos de Innovation Week y ninguno de TEDx, sin cruzar datos entre eventos.
- Playwright en los dos origenes permitidos (`http://localhost:5173/registrarse` y `http://localhost:3000/`) encontró el botón GIS y abrió el popup de `accounts.google.com`; ambos popups se cerraron antes de seleccionar una cuenta. En TEDx, los 15 recursos `/_next/static/` devolvieron 200 y el modal hidrató sin errores JavaScript.
- Ambos frontends usan el mismo Google Client ID configurado en el backend y llaman al API local `http://localhost:3100/api/v1`. Una búsqueda en código y manifests de ambos frontends no encontró Firebase.
- Pendiente de intervención humana: completar el callback de Google con una cuenta real. El challenge, la validación criptográfica con fixtures y el contrato funcionan, pero no se ingresaron credenciales. La configuración SMTP local apunta a Mailpit; no se realizó entrega a un buzón externo. Los orígenes OAuth HTTPS quedan para después de DNS/TLS. La sesión local no modificó Supabase productivo.

## Revalidación de artefactos locales (29 de octubre de 2026)

- Backend: `npm run build` y las 7 suites unitarias (37/37 pruebas) aprobaron. El contrato de proveedor Google, con firma RS256 y nonce, aprobó 9/9 pruebas.
- TEDx: con el pool predeterminado, dos suites aprobaron (6 pruebas) y el worker de `AuthProvider` agotó su tiempo de inicio. La repetición aislada con `--pool=forks --maxWorkers=1 --fileParallelism=false --testTimeout=120000 --hookTimeout=120000` aprobó 3/3 archivos y 10/10 pruebas. Typecheck y build aprobaron; lint terminó sin errores y conserva dos avisos preexistentes por `<img>` en `AvatarCta.tsx`.
- Innovation Week: `npm run verify` aprobó typecheck, lint, aislamiento, build y 16/16 archivos con 53/53 pruebas. ESLint imprimió dos mensajes del parser `jsx-ast-utils`, sin hacer fallar el comando.
- Avatar 2D: `npm run verify` aprobó typecheck, lint, build y 23 pruebas (13 de dominio y 10 del servicio). Contrato fuente del avatar en su rama 1.1.0: tests 4/4, typecheck y build aprobaron; el repositorio conserva modificaciones locales sin commit en README, package, fuente y prueba, por lo que este resultado no representa un artefacto publicado en `main`.
- No se repitieron contratos backend que requieren PostgreSQL/Redis: Docker Desktop no pudo iniciar `com.docker.service` desde esta sesión y el puerto aislado `127.0.0.1:55432` no está escuchando. No se usó el PostgreSQL del puerto 5432. No se ejecutaron migraciones ni se accedió a Supabase productivo.
- Quedan abiertos el callback Google interactivo con cuenta de prueba, el conjunto contractual del backend sobre la base aislada, la entrega SMTP externa y los gates de release ya documentados. Esta revalidación no equivale al cierre de T071/T072.
- La revisión de despliegue detectó que el README apuntaba a `deploy/.env.example`, excluido por `.gitignore`. Se añadió `deploy/server.env.example` con placeholders seguros y se actualizó el runbook; Git confirma que la plantilla nueva sí queda versionable. La plantilla real con secretos sigue fuera del repositorio.
- `docker compose --env-file deploy/server.env.example -f deploy/compose.yaml config -q` aprobó la sintaxis e interpolación estática del stack sin contactar al daemon ni iniciar o alterar contenedores.

## Verificación aislada en CI (29 de octubre de 2026)

- Docker Desktop no estaba disponible en el equipo local; para obtener evidencia funcional se ejecutó el workflow de `main` en GitHub Actions con PostgreSQL, Redis y Mailpit desechables. No se usó `localhost:5432`, Supabase ni la base del servidor.
- En `fdf6d17`, `72/72` suites y `422/422` pruebas pasaron. El fixture sanitizado aplicó las 29 migraciones; preservó la copia baseline y el hash del ledger, mantuvo las filas ambiguas legacy sin cambios, validó las constraints entre eventos y terminó con cero huérfanos.
- Evidencia: https://github.com/OctaLuna/Tedxucb-2026-backend/actions/runs/40923304212. Esta corrida corrige la nota anterior sobre contratos no repetidos por falta de Docker local; no sustituye el inicio interactivo con Google ni la verificación del servidor.

## Corrección de fechas del evento (29 de octubre de 2026)

- El cronograma confirmado ubica la Semana de la Facultad del 9 al 13 de noviembre y TEDxUCB el jueves 12 a las 14:15. Innovation Week tenía fecha de septiembre en la SPA y seed; TEDx estaba en noviembre 9 a las 14:00 en el backend, aunque su frontend y cronograma lo ubican el 12. Se corrigieron los seeds y se añadió una migración condicional para mover solo el timestamp TEDx original; las fechas que un operador haya cambiado no se sobrescriben.
- La inspección SSH de solo lectura confirmó que la base del host tenía TEDx el 9 de noviembre a las 14:00 y Semana de la Facultad el 9 a las 09:00. La migración corregirá TEDx a 12 de noviembre 14:15 al próximo despliegue; no se aplicó en este turno.

## Revalidación del servidor y deriva de release (29 de octubre de 2026)

- Se encontró y seleccionó la clave privada dedicada de despliegue; SSH conectó en modo de solo lectura. Compose remoto y fuente tienen contenido idéntico; `docker compose config -q` aprobó, Caddy validó las rutas TEDx/Innovation/IDEATHON conservando Porerekua, y las 29 migraciones actuales estaban al día.
- Backend, Innovation Week, IDEATHON y Avatar API estaban en `release-20261026-v2`; TEDx en `release-20261027-v3`. Los servicios consultados estaban saludables. No se modificó ni reinició contenedor alguno.
- El manifiesto local `release-20261027-v3` no es un paquete completo; solo registra la imagen TEDx y sus fuentes incluyen revisiones anteriores marcadas como untracked. El empaquetador se endureció para vincular cada tag a commits/hash de fuentes y no sobrescribir imágenes existentes.
