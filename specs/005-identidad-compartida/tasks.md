# Tareas: identidad compartida y eventos modulares

**Fuentes:** `spec.md`, `plan.md`, `data-model.md`, `contracts/identidad-compartida.md`.
**Estado:** implementación local en curso. El checklist histórico requiere reconciliación con el avance en `avance-integracion-2026-10-23.md`; no inferir que una tarea está pendiente o completa sin contrastar evidencia. `[P]` solo cuando no comparte artefactos con otra tarea del grupo.
**Trazabilidad:** cada tarea cita RF; cada cambio de alcance vuelve a spec/contract antes de ejecutar.

## Grupo 0 — Cierre de requisitos y reconocimiento

- [ ] T001 [P] Registrar en ADR/spec las decisiones ya acordadas sobre estados de cuenta y cerrar las pendientes que cambian esquema: requisitos de perfil por evento y prueba de titularidad externa (`RF-506–510`). Se adoptó 24 como máximo técnico del apodo.
- [ ] T002 [P] Inventariar todos los modelos Prisma, constraints SQL, triggers, seeders, APIs, consultas y migraciones; clasificar cada entidad GLOBAL/EVENT_SCOPED/DERIVED en la matriz (`RF-512–513`).
  - Identificar los CHECK de contraseña y origen para cuentas Google; selecciones manuales sin evento; transacciones sin actividad; índice global de selección; puntaje con truncamiento por movimiento. Ver `evaluacion-inicial.md` antes de diseñar el DDL.
- [ ] T003 [P] Inventariar flujos de sesión y origen de ambas webs; decidir OAuth flow/callback, client audiences, state/nonce/CSRF, refresh storage y matriz CORS dev/prod (`RF-501–502,516`). No crear secretos.
- [ ] T004 [P] Mapear registro actual, confirmación email, invitation staff, admin users, estados y roles; documentar compatibilidad y no-go para autoactivación (`RF-507–508`).
- [ ] T005 [P] Inspeccionar provider/service/editor 2D y paquete de integración, incluyendo persistencia de invitado, mensajes, owner y preview. Preparar nota de integración pendiente de deploy (`RF-511`).
- [ ] T006 Revisar ADR-010 y acordar formalmente la excepción temporal de auditoría respecto del Artículo V; preparar gate/enmienda para antes del release (`RF-514`).
- [ ] T007 [P] Documentar prerequisito de Google Cloud: propietario del proyecto, creación de OAuth client, consent screen, domains/origins/redirect URIs y valoración de costo/condiciones al momento de ejecutarlo. Mantener como pendiente (`RF-501,516`).

**Gate G0:** preguntas que cambian schema/contract resueltas. No consolidar respuestas supuestas ni DDL que dependa de ellas. El apodo es un incremento independiente cuyas reglas ya se fijaron y probaron.

## Grupo 1 — Especificación y contrato API

- [ ] T008 Definir mecanismo para Google externo cuando `email_verified` no sea prueba vigente de mailbox; nonce, email challenge, token TTL 3 días, uso único, anti-enumeración y limitación de frecuencia (`RF-501–506`).
- [ ] T009 Definir respuesta de auth para account existente/nuevo, estados no activos, nickname requerido, eventos disponibles y error anti-enumeración (`RF-501,507–509`).
- [ ] T010 Especificar contrato `GET /me`, `PATCH /me/nickname` con normalización y errores, más consulta de eventos propios (`RF-509–510`).
- [ ] T011 Especificar rutas/event scope para recursos, estrategia slug vs UUID, rol + event permission, errores y no-disclosure (`RF-503,512–513`).
- [x] T012 Especificar CRUD admin de whitelist: búsqueda normalizada por correo, scopes `eventIds`, ambos por defecto, revocación e idempotencia; el grant permanece hasta revocación manual según la decisión de producto (`RF-503–505,515`). `GET /admin/event-access` filtra por parte del correo y estado, pagina correos completos (sin dividir sus eventos) y limita cada página a 100 entradas.
- [x] T013 Especificar invitación email: precondición whitelist, MailService, template, link frontend, token hash, expiry 3 días, expiración, fallo SMTP post-commit y ausencia de resend (`RF-505–506,515`).
- [x] T014 Definir DTOs y respuestas Swagger/OpenAPI, ejemplos felices y negativos por endpoint, códigos estables y campos PII mínimos (`RF-501–516`).
- [ ] T015 Completar spec, `data-model.md`, contrato, plan, quickstart y `specs/README.md`; ejecutar matriz requisito→contrato→test→tarea (`RF-501–516`). Los documentos principales existen; queda generar y revisar la matriz integral de trazabilidad antes del gate de release.

**Gate G1:** revisar contratos API con consumidor frontend antes de pruebas.

## Grupo 2 — Pruebas aprobadas (test-first)

- [x] T016 Escribir pruebas contractuales HTTP para login Google, `/me`, nickname y eventos con DTO/errores contractuales (`RF-501–510`). Cubierto por `auth-google`, `profiles-nickname`, `me-events` e `identity-email`.
- [ ] T017 Escribir tests de proveedor para firma, issuer, audience, exp, nonce/state, hd y email verified con claves de fixture (`RF-501–502,506`).
- [ ] T018 Escribir tests de integración PostgreSQL para create/link identity concurrente, estados existentes, disabled y unique provider/subject (`RF-507–508`).
- [x] T019 Escribir tests de integración nickname: longitud/charset, canonical key, colisión, concurrencia, trim/control chars y ninguna mutación cross-user (`RF-509–510`). `profiles-nickname.contract.spec.ts` cubre apodo Unicode/normalizado, duplicados globales y carrera con un único éxito.
- [x] T020 Escribir tests para admin scopes, default dos eventos, un evento, cambio/revocación, paginación, guards ADMIN y ausencia de rol agregado (`RF-503–504,515`). `admin-event-access.contract.spec.ts` cubre scopes, revocación, ADMIN-only, concurrencia, búsqueda/paginación por correo completo y que la whitelist no crea una cuenta. Suite focalizada: 9/9.
- [x] T021 Escribir tests email invitation: whitelist requerida, token hashed, expiry clock, one-use, scope, SMTP failure y no resend endpoint (`RF-505–506`). Cubierto en `identity-email.contract.spec.ts` y `identity-email-delivery.integration.spec.ts`; no se publica endpoint de reenvío.
- [x] T022 Escribir tests de aislamiento entre evento A/B para cada controller/servicio scoped de primera entrega; incluir UUIDs cruzados y escritor no autorizado (`RF-512–513`). Contratos de 17 suites sobre actividades/categorías/staff, accesos, postulaciones, contenido, programa/En Vivo, perfiles, speakers, puntos, ranking, selección y entradas: 153 pruebas. `eventSlug` tiene guard `EventAccessGuard` en rutas protegidas; rutas públicas usan resolutores por evento y límite de frecuencia; endpoints por actividad aplican `ActivityStaffGuard`.
- [x] T023 Escribir tests de migración/backfill con fixture sanitizado, índices nuevos, huérfanos, colisiones, datos legacy y ledger inmutable (`RF-513`). `npm run test:migrations:local` aplica las 25 migraciones a un PostgreSQL efímero; comprueba backfill legacy TEDx, ownership/proyección del ledger sin alterar transacciones, ausencia de huérfanos, uniques por evento y FKs cruzadas. La ruta de migración impide colisiones de clave dentro del evento y permite reutilizar la clave en otro evento.
- [x] T024 Escribir tests frontend del flujo de auth, apodo requerido/ocupado, permisos visibles, logout y avatar opcional; no usar Firebase (`RF-511,516`). Innovation Week cubre sesión, actualización de apodo/conflicto 409, permisos, logout y avatar; TEDx cubre enlaces de correo, validación de apodo, permisos, logout tolerante a caída de Avatar API y avatar opcional. Ver `UserContext.test.tsx`, `IdentityPortal/index.test.tsx`, `AuthProvider.test.tsx` y `AuthModal.test.tsx`.
- [ ] T025 Responsable revisa y aprueba alcance de pruebas; ejecutar fase Red y registrar que cada fallo se debe a la capacidad aún no implementada, no a fixture/infraestructura (`RF-501–516`).

**Gate G2:** aprobación y Red verificable obligatorias por Artículos III/IX. No empezar implementación hasta cerrar.

## Grupo 3 — Esquema y migración expand/contract

- [x] T026 Implementar identidad externa en Prisma + migración con unique provider/subject y FK/indexes (`RF-501,507–508`). `UserIdentity` define unicidad `(provider, subject)` y `(userId, provider)`; migración `20261023020000_add_google_identity` aplica ambas claves, FK a `users` y checks de proveedor/correo. Los contratos `auth-google` y `identity-email` pasaron 22/22 en PostgreSQL local.
- [x] T027 Añadir nickname/nicknameKey nullable, índices únicos y clave canónica; no inventar valores. Migración aplicada únicamente en PostgreSQL local aislado (`RF-509–510`).
- [x] T028 Crear/seedear Event TEDxUCB e Innovation Week idempotentemente por slug; acordar UUIDs de fixture, evitar hard-code cliente (`RF-503,513`). `seed-shared-events.ts` opera solo en la base local aislada y resuelve slugs de forma idempotente; migración registra Innovation Week sin sobrescribir filas existentes.
- [x] T029 Crear tabla whitelist por email/event y constraints de revocación/expiración; conservar historiales necesarios según decisión de modelo (`RF-503–504`). `EventEmailAccess` conserva grants/revocaciones por correo normalizado y evento; migración e integración prueban unicidad e historial.
- [x] T030 Definir almacenamiento de ExternalInvitation/challenge con token hash, un uso, email normalizado, expiry tres días y relaciones a scopes (`RF-505–506`). `IdentityInvitation` persiste `eventId`; migración `20261023160000_scope_identity_invitations` y contratos verifican el scope al consumir.
- [ ] T031 Completar rollout expand/contract de `event_id` para modelos aprobados y reemplazar índices globales con índices compuestos sin perder integridad (`RF-512–513`). Estado auditado: las migraciones locales agregan nullable, hacen backfill y endurecen `NOT NULL`/índices dentro de la misma cadena de deploy; T023/T034 verifican datos y constraints, pero no prueban compatibilidad de versiones ni operación sin bloqueo. Antes de usar una base compartida, decidir ventana de mantenimiento o separar backfill/validación/contract en migraciones aditivas y ensayarlas sobre dump representativo.
- [x] T032 Implementar backfill determinista de filas TEDx e inspección de colisiones. Reportar ambigüedades y detener sin actualizar registros ambiguos (`RF-513`). La migración aborta si hay varias filas `TEDxUCB`, si el slug ya pertenece a otro evento o si la fila legacy tiene otro slug; `npm run test:migrations:local` comprueba que dos filas legacy ambiguas permanezcan sin slug después del rechazo.
  - No actualizar el ledger: definir y verificar atribución inmutable de transacciones históricas y asignaciones manuales antes de efectuar el backfill.
- [x] T033 Añadir FKs/uniques compuestos para bloquear relaciones entre eventos diferentes; conservar restricciones/índices del ledger y selección (`RF-512–513`). T023/T034 verifican que se rechacen selecciones y actividades con relaciones cruzadas y que los movimientos del ledger permanezcan inmutables.
- [x] T034 Ensayar migración en Postgres local y dump sanitizado; comparar conteos, relaciones, agregados ledger y plan forward-fix/rollback pre-cutover (`RF-513`). `npm run test:migrations:local` crea un dump custom de fixture sintético, lo restaura en una base aislada, compara filas/relaciones/suma y hash del ledger antes y después, aplica las 25 migraciones y conserva la copia baseline como recuperación hasta finalizar. El procedimiento pre-cutover queda documentado en `seguimiento-integracion-local.md`.
- [x] T035 Endurecer `NOT NULL`, retirar el índice global de evento publicado y cambiar `GET /public/event` solo después de que consumidores envíen event context (`RF-513`). La cadena de migraciones exige `event_id`, elimina `one_published_event` y los consumidores consultan los snapshots por slug; el fixture migrado comprueba ambos eventos.

**Gate G3:** zero orphan/ambiguous row, constraints verificadas y plan de despliegue revisado. No aplicar a Supabase de producción en esta feature sin autorización/deploy plan.

## Grupo 4 — Backend identidad y perfil

- [x] T036 Alinear env schema/documentación con Google Identity Services: client ID requerido al arrancar en producción, secreto OAuth/callback HTTP/redirect URI innecesarios para el flujo GIS de ID token, y secretos de sesión solo server-side (`RF-501,516`). Validación cubierta en `env-validation.spec.ts`; ver `quickstart.md`.
- [x] T037 Añadir biblioteca oficial/verificador con clock/key cache apropiado; validar firma, iss, aud, exp, nonce/state/CSRF y hd (`RF-501–502`). `GoogleAuthService` usa `google-auth-library.verifyIdToken`, audiencia configurada, nonce de un uso y `email_verified`; `auth-google.contract.spec.ts` cubre nonce/replay, dominios y verificación requerida.
- [x] T038 Implementar resolución transaccional por provider+subject; resolver correo/verificación externa; alta/vinculación sin duplicados o fusión solo por texto (`RF-506–508`). Alta/vínculo se confirma en transacción; `auth-google.contract.spec.ts` cubre identidad existente, conflictos, allowlist y estados.
- [x] T039 Aplicar estado de cuenta: disabled, pending, rejected e invited bloqueados; conservar status/roles durante link; completar controles existentes antes de acceso (`RF-507`). `auth-google` cubre los estados al vincular/login; el guard revoca acceso general a cuentas no activas y deja `PENDING` solo en las tres rutas heredadas de `/me/profile` para completar el registro. `EventAccessService` bloquea acceso a eventos hasta `ACTIVE`; contratos auth/profile lo verifican.
- [x] T040 Emitir access/refresh del backend solo tras permiso; integrar revocación/cierre/rotación existente y atender condiciones de dos orígenes (`RF-501,503,516`). El frontend renueva sesiones, comparte tokens entre orígenes por el API común y logout revoca refresh; ver pruebas de `AuthProvider`/`UserContext` y contratos de auth.
- [x] T041 Validar nickname y persistir clave canónica contra constraint unique; devolver error de colisión consistente (`RF-509–510`).
- [x] T042 Ampliar `/me` con nickname/onboarding/events; permitir perfil incompleto limitado a completar nickname; bloquear rutas normales hasta onboarding (`RF-509–510`). Contrato `profiles-nickname` verifica acceso a `/me` y `/me/events`, rechazo de rutas normales con `NICKNAME_REQUIRED` y habilitación después de guardar el apodo.
- [x] T043 Actualizar OpenAPI con DTO/response/error y bearer/roles/event scope; verificar documentación corresponde a endpoints reales (`RF-501–510`). En runtime, `/api/docs-json` contiene los endpoints de Google, verificación, invitación, apodo y eventos; invitación declara bearer.

## Grupo 5 — Backend whitelist, evento y correo

- [x] T044 Crear módulo acotado `event-access` (máximo tres módulos nuevos en feature) con DTO, controller, service y guard scope; justificar submódulo adicional antes (`RF-503–504,512,515`). `EventAccessModule` encapsula DTO/controller/service/guards y exporta solo los providers requeridos por módulos consumidores.
- [x] T045 Añadir resolver de event context estable (slug/UUID contractual), verificar status cuenta + access row en cada request de participante (`RF-503,512`). `EventAccessGuard` resuelve el slug contractual y `EventAccessService` exige cuenta activa y grant vigente; rutas admin por UUID usan `EventIdAccessGuard`.
- [x] T046 Añadir endpoints de administración ADMIN-only, CRUD/scopes y ambos eventos default; operaciones de cambio atomic/consistent y respuesta usable para UI (`RF-503–504,515`). Contrato `admin-event-access` cubre default ambos, scope único, reemplazo, revocación e idempotencia; los cambios se ejecutan con transacción.
- [x] T047 Implementar invitación básica separada de staff invitation; whitelist previa, token aleatorio hash, expiry tres días y un solo uso (`RF-505–506`). La invitación no crea permisos y exige que permanezca activo el acceso al evento vinculado.
- [x] T048 Añadir plantilla MailService y dispatch posterior al commit; respuesta observable de entrega y no logging de PII/token innecesaria (`RF-505,515`). `identity-email-delivery.integration.spec.ts` envía por SMTP a Mailpit y verifica destinatario, asunto, URL, persistencia y resultado de entrega; tokens no se registran.
- [x] T049 Añadir rate limits diferenciados para OAuth, challenge, admin invite y consumo de invitation; evitar enumeración externa (`RF-501,505–506`). Los controladores fijan prefijos/límites separados para challenge, login, verificación, invitación y consumo; los contratos verifican errores no enumerables.
- [x] T050 Aplicar autorización de evento a endpoints contenidos/activity/leaderboard/progress/points/selection incluidos en alcance. Auditar manuales para no dejar ruta paralela global (`RF-512–513`). T022 registra revisión de rutas y 17 suites/153 pruebas para recursos scoped, UUIDs cruzados y acciones sobre alumnos.
- [x] T051 Asegurar restricciones/consultas aseguran coherence de event_id a través de activity, attendance, transaction, run/selection (`RF-512–513`). Migraciones agregan FKs/uniques compuestos y ownership inmutable; T023/T034 verifican rechazos cruzados, proyección y ledger.
- [ ] T052 Registrar y documentar la excepción de auditoría sin quitar los registros actuales; detener release hasta aprobación constitucional del gate (`RF-514`).

## Grupo 6 — Frontend Innovation Week

- [ ] T053 Registrar estado del checkout y cambios locales; acordar puntos de integración con reconstrucción de «Registrate» antes de editar (`RF-509–511,516`).
- [x] T054 Crear `services/api` typed fetch, configuración `VITE_API_BASE_URL`, parseo uniforme de errores, abort/timeout y manejo de 401 (`RF-501,516`). `src/services/api.ts` implementa timeout, errores tipados y abort; auth maneja expiración/401 y refresh.
- [x] T055 Crear servicio backend-auth (inicio Google, callback, refresh, logout, `/me`, nickname) siguiendo flujo y sesión decididos; Google client secret nunca en Vite (`RF-501,507–510,516`). GIS entrega ID token al callback cliente; ambos frontends consultan el mismo API para login, refresh, logout, `/me` y nickname. No se expone client secret.
- [x] T056 Actualizar UserContext para estado async/loading/authenticated/onboarding; eliminar demo roles como autoridad y conservar vista pública sin auth (`RF-507,509,516`). `UserContext` y `AuthProvider` representan sesión backend y onboarding; perfiles de demo se aíslan de las solicitudes autenticadas.
- [x] T057 Reconstruir «Registrate» como etapas: acceso Google, estado de autorización, elección de apodo único, opción avatar 2D/omitir, éxito/continuar (`RF-503,509–511`). Flujo disponible en Innovation Week y TEDx; el apodo usa la identidad compartida y el editor opcional es Avatar 2D.
- [x] T058 Conectar panel administrativo a servicios reales: listado, alta manual, selector uno/ambos, invitar por correo, editar/revocar, estados de SMTP/error; controles ocultos no sustituyen guards (`RF-503–505,515`). Innovation Week cuenta con gestión de accesos por evento conectada a la API, con edición explícita, revocación e invitación; el modo admin demo usa filas y cambios solo locales y nunca llama al backend ni envía correo.
- [x] T059 Eliminar Firebase imports, dependencias, `.env` names, tipos y setup únicamente luego de búsqueda de consumidores; preservar otras integraciones y cambios locales (`RF-516`). Búsqueda completa en ambos frontends no encuentra referencias/imports/config Firebase ni dependencia en manifests/lockfile; Google usa únicamente el Client ID Web acordado.
- [x] T060 Mantener draft/avatar local; definir visual de avatar ausente y no invocar avatar 3D (`RF-511`). Innovation Week y TEDx ofrecen personalización opcional por Avatar 2D con referencia local; el editor 3D TEDx sigue separado del registro.
- [x] T061 Configurar Vite dev proxy/CORS con origen local exacto del frontend y API (`RF-516`). El API acepta los dos orígenes locales exactos; el challenge devolvió 200, nonce válido y `Access-Control-Allow-Origin` coincidente desde ambos puertos.

## Grupo 7 — Dominio modular y compatibilidad segunda web

- [x] T062 Completar matriz de todos los modelos con owner; convertir cada lectura/escritura global de recurso scoped a event context en service/API (`RF-512–513`). `matriz-alcance-modelos.md` cataloga 34 modelos y la auditoría T022 verifica rutas/controladores scoped.
- [ ] T063 Hacer catálogo seed y contenido inicial independientes para ambos eventos, sin un único `PUBLISHED` global (`RF-513`). Los catálogos/recursos ya son event-scoped, pero no hay contenido editorial aprobado para sembrar. Mientras tanto las webs muestran muestras en páginas públicas cuando el backend falla o devuelve listas vacías; Administración mantiene vacías las opciones para evitar guardar IDs ficticios.
- [x] T064 Cambiar selección, capacidad y export a eventId y reforzar constraints inter-tabla; verificar que algoritmo no cruza estudiantes/datos (`RF-512–513`). Contratos de selección/export y constraints compuestas verifican scope por evento; el fixture de migración rechaza referencias cruzadas.
- [x] T065 Migrar puntos/leaderboard/progress a consulta por evento manteniendo inmutabilidad de ledger y estabilidad de endpoints existentes/deprecación (`RF-512–513`). Servicios/contratos consultan `eventId`; T023/T034 verifican historial y ownership inmutables más proyección por evento.
- [x] T066 Documentar migración de contrato para segundo frontend TEDx y consumir auth/profile con mismo usuario y event context independiente (`RF-503,509,512–513`). TEDx comparte endpoints de identidad y envía su propio slug; contratos de `/me/events`, identidad y scope cubren ambas webs.

## Grupo 8 — Configuración OAuth, avatar y release gates

- [ ] T067 Crear o asignar proyecto Google Cloud y OAuth clients después de confirmar propietario; documentar costo/condiciones vigentes, consent, dominios, origins, redirect URIs y rollback (`RF-501,516`).
- [ ] T068 Probar configuración local/staging y validar que secretos viven solo en env server; configurar redirect/origin por entorno; no copiar secretos a archivos tracked (`RF-501,516`).
- [x] T069 Diseñar e implementar auth/ownership backend↔avatar-2d, vinculación guest probada, recuperación cross-device y revocación antes de deployment; actualizar contrato compartido/versionado (`RF-511`). Pruebas de servicio y contrato locales; el recorrido visual con Google real sigue gate externo.
- [x] T070 Añadir guía runbook de migración, seed, OAuth, whitelist inicial, operadores, soporte, fallback y limpieza sin borrar datos (`RF-503,505,513,516`). Ver preparación y operación local en `quickstart.md`; despliegue remoto queda fuera.
- [ ] T071 Ejecutar matriz de pruebas automatizadas, frontend, contrato y manual quickstart; reconciliar cada fallo antes de release (`RF-501–516`). Regresión backend completa: 71/71 suites y 410/410 pruebas locales. Innovation Week: typecheck, lint, aislamiento, build y 47/47 pruebas; Playwright validó invitado → Avatar 2D → guardado local (guest/avatar HTTP 201, preview HTTP 200). TEDx: typecheck, build y 13/13 pruebas; lint sin errores y dos warnings previos de imagen. Playwright confirmó muestras y aviso en agenda de ambas webs cuando el API devuelve listas vacías, sin errores JavaScript. El OAuth real con cuenta Google y entrega SMTP externa siguen sin verificación interactiva.
- [ ] T072 Revisión seguridad/PII, CORS, rate limits, auditoría aplazada, datos migrados y proveedor avatar; publicar lista de riesgos aceptada (`RF-501–516`). `npm audit` de producción/backend y frontend reporta cero; queda documentar y revisar los riesgos operativos de OAuth, SMTP, despliegue y avatar antes del release.

## Adenda — programa editorial event-scoped

- [x] T073 Definir `EventProgramItem` separado de `Activity`; migracion aditiva, FK a evento y FK compuesta a speaker del mismo evento.
- [x] T074 Publicar CRUD ADMIN con scope de evento, escritura auditada, validacion de horas y estado; lectura publica solo de elementos/speakers publicados.
- [x] T075 Conectar agenda y administracion TEDx con el contrato; presentar tipo, hora boliviana, speaker, orden y estados.
- [x] T076 Definir y conectar estado de En Vivo, quizzes y medios por evento con su propio modelo; no mapearlos a `Activity`.
- [x] T077 Documentar contrato y ADR: settings por evento, override manual/horario, estados y limites de exposicion de quiz.
- [x] T078 Añadir modelos y migracion aditiva para settings, actividades editoriales, preguntas/opciones y referencias HTTPS a medios; FK compuestas para evento/programa.
- [x] T079 Implementar DTO/servicios/controladores publicos y ADMIN-only con validacion transaccional, aislamiento y clave de respuesta solo en admin.
- [x] T080 Conectar `En Vivo` y su administracion en ambos frontends; conservar mocks locales solo si el API no responde.
- [x] T081 Probar permisos, aislamiento, schedule boundaries, override, cancelacion, quiz y privacidad de respuesta; aplicar migracion solo a PostgreSQL local.

La especificacion de detalle esta en `contracts/event-program.md`; ADR-011 registra la decision. La corrida backend completa de 385 pruebas precede a esta adenda; el nuevo contrato tiene seis pruebas y se repetira la matriz total antes de cerrar este bloque.

## Adenda — provisión de administradores iniciales

- [x] T082 Configurar una allowlist `ADMIN_EMAILS` privada en backend; autoasignar ADMIN y ambos permisos de evento al iniciar sesión por Google, de forma transaccional e idempotente. Ver `.env.admin.local` (ignorado), RF-517, prueba `auth-google` y runbook local.

## Dependencias y límites

Grupos secuenciales: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Las tareas marcadas `[P]` dentro del Grupo 0 solo pueden paralelizarse si no se comparte/escribe el mismo artefacto. Grupos 6 y 7 pueden dividirse por repositorio/modelo una vez exista contrato y base backend, pero nunca saltarse G3/G4.

**Definition of Done por tarea:** requisito rastreable; contrato actualizado si cambia borde HTTP; prueba de comportamiento ejecutada; error/logs sin secreto; tipos/lint/build correspondientes limpios; diff enfocado sin refactor incidental; review de cambios locales concurrentes; documentación/runbook actualizada si altera operación. La aprobación de producción y la configuración Google/avatar son gates aparte, no se dan por completadas por un build local.

