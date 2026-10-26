# Avance de integracion y verificaciones locales

Esta nota actualiza el estado anterior de `continuacion-2026-10-23.md` y `estado-implementacion-2026-10-23.md` para los cambios registrados abajo. No declara terminado el release ni reemplaza los gates de OAuth, despliegue o proveedor de correo.

La actualizacion de En Vivo al final de este documento supersede los pendientes de contenido editorial y En Vivo anotados en las notas previas.

## Avatar 2D vinculado a la identidad compartida

- El backend emite tokens puente HS256 de 90 segundos con `AVATAR_BRIDGE_SECRET` independiente del JWT de sesion. Incluyen `iss`, `aud`, `scope`, `sub` y `jti`; la revocacion comprueba que la cuenta siga activa.
- `GET /api/v1/me/avatar-session` y `POST /api/v1/me/avatar-session/revocation-token` entregan credenciales de claim y revoke al usuario autenticado.
- El servicio Avatar 2D valida firma, emisor, audiencia, scope, expiracion, UUID y replay; cambia el ownership de un draft invitado a la cuenta, conserva el documento en SQLite y recupera la referencia existente al volver a autenticarse. Logout revoca sesiones de editor y conserva el documento.
- El contrato compartido subio a 1.1.0 para transportar la credencial puente. Innovation Week y TEDx la piden al backend al abrir/cerrar el editor. El panel sigue permitiendo omitir la personalizacion.
- CORS del servicio limita las solicitudes a los dos origenes de frontend y al editor local. Se documentaron el secreto separado y la configuracion en `avatar-2d/docs/shared-identity.md`.
- Limite: la verificacion de dos navegadores usa pruebas de servicio y SQLite local; falta un recorrido de navegador con una identidad Google real para probar el flujo completo visual.

## Contenido de TEDx

- TEDx lee speakers desde `/public/speakers?eventSlug=tedxucb`.
- Se definio `EventProgramItem` para agenda editorial, separado de `Activity`, que conserva su significado de check-in/puntos. Incluye FK compuesta a speaker del mismo evento, estados draft/publicado/cancelado, orden y rango horario. Ver [ADR-011](../../docs/decisiones/ADR-011-programa-editorial-event-scoped.md) y [contrato](./contracts/event-program.md).
- TEDx ahora consulta `/public/program?eventSlug=tedxucb`, presenta tipo, horario, speaker y retrato aprobados, calcula estado segun hora de Bolivia y refresca el estado durante la sesion. Innovation Week puede consumir la misma ruta con su slug.
- El panel administrativo TEDx lista, crea, edita, ordena, publica y cancela elementos del programa mediante el API; carga speakers del evento para seleccion.
- La API limita escritura a ADMIN con scope del evento. Lo publico no muestra borradores ni speakers sin publicar; cancelar conserva el registro.
- Aun no hay programa o speakers publicados en las bases locales. No se inventaron datos del evento.
- La configuracion de En Vivo y su administracion siguen locales; requieren un contrato persistido propio y no se deben representar como actividades de check-in.

## Verificacion realizada

- Backend compila con `npm run build`.
- Contratos de identidad, Google, apodo, correo, whitelist, acceso a eventos y Avatar: 50 pruebas focalizadas aprobaron. Scope/evento y correo se repitieron con `--testTimeout=30000` por el tiempo de inicio de PostgreSQL y aprobaron 11/11.
- Contratos heredados ajustados a la propiedad por evento: 7 suites aprobaron 35/36; la ultima expectativa antigua exigia un unico evento publicado globalmente. Se actualizo para comprobar que TEDx e Innovation Week se pueden publicar de forma independiente; suite corregida aprobada 7/7.
- Speakers, seleccion, envio de correo via Mailpit y entradas/check-in: 4 suites, 16/16 pruebas aprobaron tras sembrar el evento y los scopes de fixture requeridos.
- Corrida integral backend antes del programa: 68 suites y 385 pruebas aprobaron en 494.5 segundos. Despues de incorporar el nuevo modulo se repitio `npm run test:local -- --runInBand --testTimeout=30000`: 69 suites y 390 pruebas aprobaron en 506.6 segundos.
- Programa editorial: la prueba contractual primero fallo por rutas inexistentes; tras migracion local, controller, validacion, servicio y consumidor admin/publico, aprobo 5/5. Backend build y validacion Prisma pasaron. Swagger y ambos slugs devuelven 200 en la API local.
- Avatar 2D servicio: 9/9 pruebas. Innovation Week: 29/29, lint, build y chequeo de aislamiento aprobados. TEDx: build y TypeScript aprobados; lint sin errores (dos advertencias preexistentes sobre `img` en `AvatarCta.tsx`).
- Los servicios locales API, TEDx, Innovation, Avatar API y editor devolvieron HTTP 200. Swagger incluye las rutas de avatar, speakers y actividades. El preflight de avatar devolvio 204 para ambos origenes locales.
- Las pruebas y migraciones se ejecutan contra PostgreSQL aislado en loopback. Ninguna prueba nueva usa Supabase.

## Bloqueos externos y trabajo pendiente

- El OAuth Client ID Web ya está configurado en el `.env` local ignorado del backend y en los `.env.local` ignorados de ambos frontends. La prueba de botón/origen Google pasó; falta un inicio interactivo con una cuenta autorizada para comprobar callback, emisión de sesión y permisos ADMIN. No se necesita client secret ni redirect URI en el flujo GIS de ID token.
- Mailpit valida el flujo de correo local. El SMTP del entorno local pasó `transporter.verify()` sin exponer valores ni enviar mensajes; falta comprobar entrega real controlada a un destinatario aprobado y configurar las variables del entorno desplegado.
- No hay elementos del programa ni speakers publicados en las bases locales. El panel de agenda ya guarda y edita via API; hacen falta datos aprobados para mostrar contenido. TEDx aun no tiene un panel UI para editar las fichas de speakers.
- La administracion y configuracion de En Vivo en ambos proyectos necesita un modelo/backend modular propio; su semantica no coincide con `Activity` de check-in.
- Deben repetirse registro, apodo duplicado, permisos, logout, refresh y recuperacion de avatar en navegador una vez configurado Google. Los gates de despliegue, auditoria diferida, secreto por entorno y plan de migracion permanecen abiertos.

## Actualizacion: En Vivo y despliegues frontend (23 de octubre de 2026)

- En Vivo ahora tiene `EventLiveSettings`, actividades editoriales, preguntas/opciones y referencias HTTPS propias, con FK compuestas al evento y al programa. La API pública no incluye `correctOptionId`; administración requiere bearer, `ADMIN` y scope del evento. No se reutiliza `Activity`.
- `GET /public/live`, administración, override y cancelación funcionan con ambos slugs. Horario usa el intervalo `[startsAt, endsAt)`. La lectura pública aplica defaults sin escribir en la base. No se agregó auditoría nueva a este módulo.
- Innovation Week y TEDx consumen el estado público y guardan cambios administrativos contra la API. El selector de charla usa IDs de `/public/program` o `/event-program`, evitando cruces con IDs de actividades de check-in. Fallback local conserva datos de muestra cuando el backend no responde; invitados/admin demo mantienen cambios locales. Los adjuntos binarios siguen locales hasta configurar un proveedor de carga; el backend admite referencias HTTPS.
- La migración `20261023150000_add_event_live_content` fue aplicada y verificada únicamente en `127.0.0.1:55432/ted_backend_local` y `ted_integration_test`. Nunca se aplicó a Supabase durante esta etapa.
- Pruebas focalizadas de programa + En Vivo: 11/11 aprobadas. Innovation Week: verificación completa con typecheck, lint, 32/32 pruebas, aislamiento y build. TEDx: typecheck, lint sin errores (dos advertencias `<img>` preexistentes) y build aprobados.
- En la primera corrida completa posterior al módulo En Vivo, 69 suites/395 pruebas aprobaron y un hook de `profiles-me.contract.spec.ts` excedió 30 segundos por la espera de PostgreSQL en `DataFileImmediateSync`, no por una aserción fallida. Al repetir secuencialmente con timeout de 120 segundos, aprobaron 70/70 suites y 396/396 pruebas en 576.352 segundos. La latencia de disco siguió alta; T071 conserva pendiente el recorrido manual de Google y la comprobación de entrega SMTP.
- Commits frontend enviados en ramas separadas: Innovation `377b141` (`main`) y TEDx `95e70a1` (`master`). Ambos despliegues de integración quedaron `READY` y respondieron HTTP 200. TEDx recibió luego el commit `b01d83a` en `master` para corregir advisories críticos; producción quedó `READY`, el alias y `/studio` responden 200 y `pnpm audit --prod` no reporta vulnerabilidades. Innovation: [innovation-week-landing.vercel.app](https://innovation-week-landing.vercel.app). TEDx: [tedx-ucb-landing-leoibarralopez-6709s-projects.vercel.app](https://tedx-ucb-landing-leoibarralopez-6709s-projects.vercel.app).
- La API local fue reiniciada con el build actual; `/api/v1/health` responde `ok` y `/api/v1/public/live` devuelve IDs distintos para `tedxucb` e `innovation-week`.

Los gates de OAuth Google real, entrega SMTP controlada, verificación visual autenticada con cuentas reales, recuperación de avatar cross-device y revisión pre-release siguen dependiendo de configuración/credenciales de staging y no se consideran cerrados por estos despliegues frontend.

## Seguimiento de verificación documental (23 de octubre de 2026)

- Se corrigió `specs/README.md`, cuyo resumen todavía presentaba `005` como planificación y omitía la implementación integrada. También se marcó explícitamente como histórico el estado inicial de `progreso.md`.
- `quickstart.md` ahora reúne pasos de operación local, migraciones/seed acotados a loopback, configuración pendiente de Google, administración de whitelist, diagnóstico SMTP, fallback, rollback y limpieza sin borrar datos. No habilita ni documenta aplicar migraciones a Supabase productivo.
- La verificación no revela valores: el SMTP local completó `transporter.verify()`; ambos proyectos Vercel reportan que no tienen variables en Production y no hay client ID Google en los archivos revisados. No se envió correo real ni se cambió configuración remota.
- Verificación ejecutada tras esos cambios: backend actualizado a Nest `11.1.29`, Express `5.2.1`, Nodemailer `10.2.1`, Vercel Blob `2.8.2`, Prisma `7.10.1` y dependencias transitivas corregidas. El parser Express se fija en `extended` para preservar las query strings previas. `npm run build` aprobó; la matriz completa backend aprobó 70/70 suites y 396/396 pruebas en 612.518 s; tras el último parche de dependencia dev pasaron además 4 suites/24 pruebas focalizadas. Innovation Week pasó `npm run verify` (typecheck, lint, 32/32 tests, aislamiento y build). TEDx tras Next `16.4.1` pasó typecheck, lint sin errores (dos advertencias `<img>` preexistentes) y build. La API local actual devuelve `health=ok`, Swagger 200 y UUID distintos para ambos slugs. El recorrido OAuth/browser real y la entrega SMTP controlada siguen pendientes.
- El CLI autenticado de Vercel confirmó que `innovation-week-landing` y `tedx-ucb-landing` no tienen variables configuradas en Production. No se cargaron variables ni se alteraron despliegues; los fallbacks de muestra actuales permanecen como ruta de producción hasta que exista API desplegada y configuración por entorno.
- Revisión de dependencias: Innovation Week `npm audit --omit=dev` y backend `npm audit` completo reportan cero vulnerabilidades tras actualizar las versiones compatibles y aplicar overrides acotados a `qs`, Ajv y `js-yaml`. Para TEDx, `pnpm audit --prod` reporta cero vulnerabilidades tras actualizar Next.js a `16.4.1`; el audit completo mantiene 7 advisories de dependencias no productivas (5 altas, 2 moderadas). La release oficial [v16.4.1 de Next.js](https://github.com/vercel/next.js/releases/tag/v16.4.1) incluye los fixes críticos de RCE y un fix alto de DoS que motivaron el cambio. T072 sigue abierto por concluir la revisión de PII, CORS, rate limits, auditoría aplazada, migración y proveedor de avatar, y registrar aceptación formal de los riesgos restantes.

## Verificacion local adicional (23 de octubre de 2026)

- Swagger documentaba operaciones sin informar el prefijo global. Ahora el OpenAPI publica `servers: [{ url: "/api/v1" }]`; `Try it out` resuelve rutas como `/api/v1/auth/google/challenge`. La UI de Swagger continua respondiendo 200.
- Se alinearon las URLs del CDN Swagger UI con `swagger-ui-dist@5.32.13`, version instalada junto con `@nestjs/swagger@11.4.7`.
- Se detecto y reinicio el servidor TEDx local que seguia usando Next 16.3.3 y devolvia 500. El proceso actual usa Next 16.4.1; TEDx, `/studio`, Innovation Week, Avatar 2D y la API responden 200. Los preflight CORS locales de `localhost:3000` y `localhost:5173` responden 204.
- El endpoint de desafio Google devuelve 503 porque `GOOGLE_CLIENT_ID` no esta configurado en el proceso actual. Los archivos de entorno locales revisados no contienen IDs GIS; el login Google real y la entrega SMTP controlada siguen pendientes. No se modifico Supabase productivo.

## Alineacion del calendario de Innovation Week (23 de octubre de 2026)

- El calendario publico de Innovation Week consumia `/public/activities`, cuyos registros son actividades con puntos/check-in. Se cambio para consumir el programa editorial `/public/program?eventSlug=innovation-week`, coherente con `EventProgramItem` y ADR-011. La relacion de speaker y el tipo editorial se mapean a la UI; las actividades conservan su endpoint separado.
- `npm run verify` aprobo tras el cambio: typecheck, lint, 13 archivos/34 pruebas, aislamiento y build.

## Enlaces de correo con contexto de evento (23 de octubre de 2026)

- Las invitaciones administrativas y los desafios de titularidad aceptan el slug permitido del evento. El backend exige que el correo tenga un acceso activo a ese evento y selecciona `PUBLIC_FRONTEND_URL_TEDX` o `PUBLIC_FRONTEND_URL_INNOVATION_WEEK`; si falta la URL especifica devuelve `FRONTEND_URL_UNAVAILABLE` y no genera un enlace ambiguo. `start:local` apunta a los dos frontends locales.
- Innovation Week envia el slug asociado al permiso invitado; TEDx envia `tedxucb` al pedir verificacion externa. La invitacion no concede acceso y mantiene el consumo de un solo uso/TTL de tres dias.
- Verificacion: build backend aprobado; contrato de invitaciones/verificacion 7/7; Innovation Week `npm run verify` con 34/34 pruebas; TEDx typecheck, lint y build aprobados (dos warnings `<img>` ya existentes).

## Actualización: URLs de correo por evento y publicación frontend (23 de octubre de 2026)

- Los enlaces de verificación e invitación se generan con el origen configurado para el evento elegido. `eventSlug` es requerido y limitado a `tedxucb` o `innovation-week` en creación de invitaciones/verificaciones. El login normal de Google conserva solo `credential` y `nonce`.
- `npm run build` aprobó. Contratos focalizados de Google, verificación/invitación, apodo, grants de acceso, eventos de usuario y tokens puente de avatar: 6 suites y 43/43 pruebas aprobaron contra `ted_integration_test` local.
- Swagger local comprobado después de reconstruir/reiniciar el proceso: `/auth/google` usa `GoogleLoginDto` sin `eventSlug`; `/auth/google/email-verification/request` usa `GoogleEmailVerificationDto` y requiere el slug; `/admin/identity-invitations` requiere `email` y `eventSlug`.
- Innovation Week: `npm run verify` aprobó (typecheck, lint, 34 pruebas, aislamiento y build). Commit `36167dd` en `main`, push completado; Vercel Production quedó `Ready` y el alias respondió HTTP 200.
- TEDx: typecheck, lint (dos advertencias preexistentes de `<img>`) y build aprobados. Commit `b8f00d3` en `master`, push completado; Vercel Production quedó `Ready`.
- API local, Swagger, Innovation Week, TEDx y Avatar editor respondieron HTTP 200. Todas las verificaciones se limitaron a servicios y bases locales.
- Pendiente: Google Client ID real, entrega SMTP configurada, despliegue del backend con base aislada y revisión de migración antes de cualquier entorno compartido. No modificar Supabase productivo.
- Nueva verificación SMTP local de extremo a extremo: `tests/integration/identity-email-delivery.integration.spec.ts` llama al endpoint de invitación con ADMIN y grant de evento, entrega por SMTP real a Mailpit, valida destinatario, asunto, URL de Innovation Week y persistencia del permiso/invitación. Resultado: 1/1 aprobada en `ted_integration_test`; no se envió correo externo.
- Smoke check de aislamiento público local: `/public/event?slug=...` devuelve el slug y evento solicitado para ambos; `/public/live?eventSlug=...` devuelve IDs de evento distintos; `/public/program` y `/public/speakers` se consultan con el slug correspondiente. En la base local todavía no hay agenda ni speakers publicados, por lo que las respuestas están vacías y los frontends deben conservar sus muestras.
- Avatar 2D verification rerun: `npm run verify` passed for the editor/domain/service workspaces (TypeScript, ESLint, 13 domain tests, 9 service tests, editor production build and service build). The 9 service tests cover anonymous drafts, claim, replay/revoke, ownership, and cross-session access; all data stays in the Avatar 2D local SQLite test store.
- Vercel: búsqueda por proyectos `backend` no encontró un proyecto de API. `tedxucb.vercel.app` corresponde al frontend TEDx (root `frontend`, repo `tedx-ucb-landing`) y responde 404 en `/api/v1/health`; no es un backend desplegado. La etapa productiva debe seguir en fallback hasta preparar un proyecto de API y base de staging aislados, sin reutilizar Supabase.
- El flujo OAuth quedó documentado según el código GIS actual: client tipo Web, Authorized JavaScript origins para localhost y los dos dominios estables, audiencia `External` para que cuentas no UCB autorizadas puedan iniciar sesión, y test users mientras la app esté en `Testing`. No se requiere redirect URI ni client secret para el flujo de ID token implementado. Referencias oficiales enlazadas en `quickstart.md`.

## Repriorización de ejecución: local primero (23 de octubre de 2026)

El responsable pidió completar primero el recorrido funcional local y dejar Vercel fuera por ahora; la etapa final será Docker y despliegue en un servidor. No cambiar Supabase productivo.

La verificación segura de `.env` encontró ausente el client ID en backend, Innovation Week y TEDx en ese momento. La única credencial necesaria era un **OAuth 2.0 Client ID de una aplicación Web** (`*.apps.googleusercontent.com`), no API key ni client secret. Estado actual: ya está configurado localmente en los tres procesos; las solicitudes de challenge devuelven 200 con CORS exacto para `http://localhost:3000` y `http://localhost:5173`. La autenticación interactiva real aún queda pendiente. El runbook está en `quickstart.md`.

## Auditoría de permisos administrativos por evento (23 de octubre de 2026)

- `GET /events` ya solo devuelve eventos accesibles al administrador. La whitelist administrativa también filtra su lectura, creación/reemplazo y revocación por el scope del actor; omitir `eventIds` usa todos los eventos que administra (ambos por defecto cuando cuenta con ambos scopes). Un reemplazo en un evento deja intactos grants fuera del scope del actor.
- Ajustes de puntos y asignaciones manuales verifican el scope del alumno objetivo; una cuenta sin permiso de ese evento no recibe registros cruzados.
- Verificación tras estos cambios: `npm run build` y regresión completa local aprobaron: 71/71 suites, 409/409 pruebas. Los contratos focalizados de whitelist/scope aprobaron 14/14.
- Reiniciados los procesos locales: API health y Swagger 200, TEDx 200, Innovation Week 200, Avatar 2D 200; el challenge Google devuelve 200 y CORS exacto para `localhost:3000` y `localhost:5173`.
- El inicio con una sesión Google real en navegador y la entrega SMTP a correo externo siguen pendientes de verificación; no se modifica Supabase productivo.
## Verificación de origen Google GIS con navegador (23 de octubre de 2026)

- El Client ID local carga y muestra el botón GIS en Innovation Week `/registrarse` y en el diálogo de TEDx. Un click anónimo desde cada origen abre el formulario oficial de Google (`accounts.google.com/v3/signin/identifier`); no aparece el error de origen no autorizado. Ambos challenges del backend responden 200; JavaScript no registró errores.
- No se ingresó una cuenta en el navegador aislado. La emisión real de credencial, callback, creación/vinculación de identidad, rol ADMIN para el correo de allowlist y navegación posterior aún necesitan un login interactivo.

## Validación de configuración Google local y requisito de servidor

- Se comprobó que el mismo Client ID está configurado en el `.env` ignorado del backend y en los `.env.local` ignorados de Innovation Week y TEDx. No se imprimieron los valores; los frontends configuran únicamente el Client ID público para Google.
- El backend activo emite nonce por `/auth/google/challenge` con HTTP 200 y CORS exacto para `http://localhost:3000` y `http://localhost:5173`.
- `GOOGLE_CLIENT_ID` ahora es obligatorio al arrancar con `NODE_ENV=production`; permanece opcional en desarrollo. `env-validation.spec.ts`: 7/7; `npm run build`: aprobado.
- Los contratos `auth-google` y `event-scope` volvieron a pasar: 2 suites, 18/18 pruebas. La autenticación Google con credencial real sigue sin verificación interactiva.

## Validación local final (26 de octubre de 2026)

- Backend: `npm run build` y la suite local completa pasaron; resultado más reciente: 71/71 suites y 412/412 pruebas. La prueba de migraciones validó las 28 migraciones en una base aislada y no modificó Supabase.
- TEDx, Innovation Week y Avatar 2D pasaron sus verificaciones de tipo, lint/build y pruebas documentadas en sus repositorios. API, ambos sitios, API/editor de Avatar y Mailpit respondieron HTTP 200 en local.
- Invitación de punta a punta desde la API local: un administrador sintético con scope de Innovation Week invitó un correo de prueba autorizado; Mailpit recibió el mensaje, el enlace apuntó al frontend local y la invitación expiraba en tres días. La invitación, whitelist y usuario sintéticos se eliminaron al terminar; quedó un único administrador de desarrollo activo y se conservó el trigger RF-119. El mensaje de prueba también se eliminó de Mailpit.
- Se verificaron las solicitudes de challenge Google y CORS para ambos orígenes locales. No se completó un inicio interactivo con una cuenta Google: esta sesión no tenía navegador disponible. Falta confirmar emisión de credencial, callback, creación/vínculo de identidad, rol allowlist y navegación autenticada con una cuenta autorizada.
- La entrega por Mailpit local está comprobada. Configurar y validar SMTP externo sigue reservado al último paso solicitado; no se envió correo externo. El despliegue al servidor queda condicionado a esa configuración y a completar la comprobación OAuth interactiva.

## Revisión de provider y trazabilidad (26 de octubre de 2026)

- Para cerrar la brecha entre los contratos con claims simulados y el proveedor real, `tests/unit/auth/google-id-token-verifier.spec.ts` firma JWT RS256 con una clave efímera y hace que `google-auth-library` valide firma, issuer, audience, expiración, nonce, `email_verified` y replay. Resultado: 9/9; `npm run build` aprobado. Las reglas `hd` y de dominio siguen cubiertas por el contrato de auth.
- La regresión ampliada de 72 suites terminó con 68/72 suites y 417/421 pruebas; cuatro hooks de inicialización excedieron 30 segundos en suites de whitelist, postulaciones y avatar/concurrencia. Esos cuatro archivos se repitieron con `--testTimeout=120000`: 4/4 suites, 30/30 pruebas aprobadas. La suite anterior a esta prueba nueva había pasado 71/71 suites, 412/412.
- Se reconciliaron el contrato HTTP y el modelo de datos con el código actual y se añadió `trazabilidad-requisitos.md` para RF-501–RF-517. El validador de enlaces locales comprobó ocho documentos. La revisión técnica de riesgos está en `revision-riesgos-local-2026-10-26.md`; no implica aceptación de release.
- Pendientes que requieren decisión/entorno: alcance futuro del perfil académico por evento; mes/año del calendario antes de guardar timestamps; propietario/estado del proyecto Google y login humano; SMTP externo; plan operativo expand/contract; aprobación constitucional de la excepción RF-514. No se modificó Supabase productivo.
