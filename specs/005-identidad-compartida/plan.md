# Plan técnico: identidad compartida y acceso modular por evento

## 1. Objetivo de implementación

Entregar primero un cimiento seguro y comprobable: autenticación directa con Google validada por el backend, resolución de una cuenta global existente, apodo global único, acceso externo gobernado por whitelist y autorización por evento. Conectar inicialmente Innovation Week y dejar contratos y modelo listos para TEDxUCB. El aislamiento se implementa en backend antes de exponer recursos de cada evento a ambos frontends.

El plan sigue el orden contratos → pruebas de contrato aprobadas → modelo/migración → servicio → integración frontend → endurecimiento y verificación manual. Los artefactos de SDD son la fuente de trabajo; Swagger publica únicamente contratos ya aprobados e implementados.

## 2. Línea base y hallazgos

- Backend: NestJS, Prisma 7, PostgreSQL, JWT de acceso de 15 minutos y refresh token rotativo persistido. `User.email` es único; hoy no existe identidad federada, apodo o permiso de participante por evento.
- Autenticación actual: login correo/contraseña. El registro institucional requiere perfil de alumno y consentimiento; cuentas no activas son bloqueadas. Invitación actual se orienta a ADMIN/STAFF y establece contraseña; no debe reutilizarse como si autorizara participantes externos.
- Eventos: el modelo `Event` existe, pero una restricción parcial permite solo un `PUBLISHED`; `Activity` y contenido no están plenamente aislados por `eventId`; algunos tipos/catálogos, ajustes y operaciones de selección son globales o requieren inspección de relaciones antes de migrar.
- Innovation Week: sesión de demostración en `UserContext`; Firebase está instalado/configurado con variables vacías, sin proveedor OAuth integrado. Vistas de registro y datos de juego tienen trabajo local en curso; preservar y coordinar esos cambios.
- Google: no se encontraron variables ni cliente OAuth configurado en los archivos inspeccionados. La configuración de Google Cloud y costo/condiciones se documentan como prerrequisito pendiente, nunca se inventa ni se almacena en Git.
- Avatar 2D: servicio independiente con token anónimo de invitado y SQLite. El contrato de iframe valida origen, ventana y sesión, pero su mensaje no acredita propiedad del documento.
- La evaluación detallada está en `evaluacion-inicial.md`: los CHECK de origen/contraseña, selecciones manuales sin evento y el cálculo de puntos con truncamiento condicionan el diseño y la migración.

## 3. Límites de arquitectura

### Identidad y autorización

`User` sigue siendo el agregado global. Añadir asociación federada estable y apodo global. La identidad externa se representa por `(provider, subject)` con restricción única; no usar email como identificador federado. La resolución del usuario, vínculo de identidad, aplicación de política y sesión se realizan sin fusionar cuentas únicamente por coincidencia de texto.

La whitelist es autorización por correo y evento, no identidad ni rol. Modelar permisos para los eventos existentes usando referencias estables (`eventId`); crear los dos eventos de forma repetible o vincular sus UUID por configuración de despliegue. Una autorización nueva selecciona ambos por defecto en el caso de uso, pero el esquema guarda asociaciones explícitas por evento. Permitir una autorización o varias eventos; revocación y vigencia se definen en un único lugar.

### Modularidad de eventos

Los datos compartidos de identidad (usuario, identidad Google, apodo) viven fuera del agregado `Event`. Datos operativos pertenecen a un evento explícito. FKs, claves únicas y consultas incluyen `eventId` cuando la unicidad es local al evento. Las rutas reciben un evento explícito y verifican permiso en servicio/guard, nunca deducen alcance desde el frontend. No aceptar que un token sin evento lea datos por defecto del evento publicado.

Antes de DDL, elaborar un inventario de cada modelo/recurso/API: global, propiedad del evento o referencia a evento. No añadir una columna por reflejo ni cambiar significado del ledger, ranking o asignación de butacas. `SelectionRun.eventId` existente sirve como referencia para auditar su alcance; sus FKs deben impedir seleccionar datos de otro evento.

### Sesión y navegador

Decisión implementada: Google Identity Services entrega el ID token mediante callback JavaScript y el backend lo valida con su cliente oficial contra `GOOGLE_CLIENT_ID`, emisor, expiración y nonce de un solo uso; `hd` se comprueba para pertenencia Workspace. Los dos frontends usan el mismo client ID y los orígenes JavaScript autorizados; no se usa authorization-code, callback HTTP ni redirect URI en este flujo. Ver el runbook OAuth en `quickstart.md`.

Mantener JWT corto y refresh rotativo existente si satisface la integración. Decidir ubicación/protección de refresh en frontend (cookie HttpOnly/SameSite con dominio adecuado o almacenamiento por origen) al definir dominios reales; no colocar secretos del cliente Google en Vite. Las dos webs deben recuperar la misma identidad, pero no compartir automáticamente un refresh entre dominios distintos sin decisión explícita.

### Apodo

Requisito: entre tres y 24 caracteres normalizados, único global y solo letras/números Unicode. Normalizar NFKC, comparar sin distinguir mayúsculas y guardar una clave canónica con índice único PostgreSQL. Se adopta 24 como límite técnico dentro de la autonomía de implementación autorizada. Excluir separadores, espacios, signos, controles y caracteres invisibles. Errores estables: forma inválida y apodo ya ocupado; nunca reservar mediante preconsulta como única garantía.

### Whitelist e invitación básica

La autorización se crea administrativamente para correo normalizado y uno o ambos eventos (ambos por defecto). No asigna roles. Se puede crear autorización manual sin email o enviar invitación después de insertar la dirección permitida. Invitación usa token aleatorio de un solo uso guardado como hash y vence en tres días. No se implementa reenvío, tracking o aceptación avanzada; whitelist persiste hasta revocación manual. El endpoint de acceso vuelve a evaluar permiso y evento cada vez; conocer/reenviar el enlace no concede acceso.

Definir email externo como no autorizado hasta prueba adecuada de titularidad. Un token Google demuestra `sub`; no siempre demuestra control actual de una dirección externa no alojada por Google. En particular, no asociar una cuenta por correo coincidente si Google no es autoridad suficiente: completar diseño del desafío de correo antes de habilitar ese caso.

### Perfil heredado y estado

Vinculación automática a cuenta preexistente tras prueba segura, sin duplicar usuario ni borrar relaciones. Decisión confirmada: `PENDING`, `REJECTED` e `INVITED` conservan estado y siguen bloqueadas hasta completar los controles existentes; `DISABLED` siempre bloqueada. Ningún login Google otorga rol `ADMIN`/`STAFF` ni convierte por sí solo registro en alumno elegible.

### Auditoría

La prioridad de esta fase es el flujo funcional y se acuerda no agregar nuevas escrituras de auditoría para acciones nuevas de la feature: vínculo Google, whitelist, invitación y cambios de permiso por evento. Esto se aparta del Artículo V y de la regla existente de alta sensible. Registrar la excepción en ADR-010 y en el registro de complejidad; fijar un gate de revisión antes de despliegue. No quitar auditoría existente fuera de este flujo ni tocar trazabilidad del ledger. Si la constitución no se enmienda formalmente, la salida a producción queda bloqueada.

### Avatar

En «Registrate», completar autenticación/apodo y ofrecer editor 2D o continuar sin avatar. No usar Firebase ni servicio 3D. Antes de guardar una referencia de forma duradera, diseñar autenticación del servicio 2D, asociación de propietario y migración segura de invitado; el ID/reference/postMessage del cliente no otorgan propiedad. Se agenda en la preparación de despliegue y no bloquea el acceso sin avatar.

## 4. Modelo de datos propuesto

El detalle DDL y mapeo legado se mantiene en `data-model.md`. Conceptualmente:

- `users`: añade `nickname`, `nickname_key` nullable durante backfill. Luego de completar datos se vuelve obligatorio para las cuentas participantes de este flujo; unicidad en `nickname_key`.
- `external_identities`: UUID, `user_id`, proveedor fijo `google`, `subject`, timestamps; unique `(provider, subject)`, FK a users, índice por user. Email de proveedor se conserva solo si existe propósito documentado; el email canónico de cuenta se mantiene en `users`.
- `events`: eliminar exclusividad global del estado `PUBLISHED`; estados y transiciones siguen limitados y verificables por evento.
- `event_email_access` (nombre provisional): email normalizado, event_id, created_at, expires_at opcional, revoked_at; unique `(email_normalized,event_id)`, FK a event. No asigna roles. La whitelist manual no expira por defecto; solo cambiar expiración si producto confirma otra política.
- `auth_tokens`: reutilizar familia de tokens de un solo uso cuando no contradiga constraints existentes, o tabla separada si invitaciones de participante difieren de invitación staff. Token persistido como hash; tipo específico, email objetivo, eventos autorizados, creador, expires_at de 3 días, consumed_at. No almacenar el token claro.
- `activities`: asociar `event_id` obligatorio, respaldado por una de las filas de Event; índices/únicos pasan a incluir evento cuando el nombre/categoría sea local.
- `activity_categories`, `content_blocks`, `speakers`, `speaker_applications`, `consent_versions`, y configuraciones públicas: determinar propiedad en matriz antes de migrar. Cualquier dato específico de evento recibe FK/index y los endpoints reciben alcance explícito.
- Participación/ledger: estudiante puede ser global; `attendance` deriva evento por actividad. Cualquier consulta o ajuste debe comprobar que `student -> activity -> event` pertenece al alcance autorizado. No cambiar puntos históricos ni borrar datos.
- Selección: asegurar que el run, cupo/selección y actividad/evento referenciados corresponden al mismo `event_id` mediante constraints compuestas o transacción validada donde SQL no lo exprese. Preservar restricciones del ledger y de auditoría actuales.

### Estrategia de migración segura

1. Hacer backup/inspección read-only del esquema y conteos en Supabase; nunca aplicar migración de experimento automáticamente a producción.
2. Inventariar datos actuales y asignar el evento actual TEDxUCB a todas las filas existentes que pertenecen inequívocamente a él. Filas ambiguas se reportan y bloquean migración hasta decisión.
3. Migrar en fases expansivas: crear eventos y columnas nullable/tablas; backfill determinista; verificar huérfanos/duplicados; crear índices y FKs; actualizar app para escribir alcance; después endurecer `NOT NULL` y retirar el índice único de publicación global.
   Las transacciones históricas del ledger no admiten UPDATE: diseñar una atribución inmutable verificable y resolver las transacciones sin actividad antes de elegir cualquier estrategia de backfill. Las selecciones manuales también requieren atribución explícita.
4. Usar `CREATE INDEX CONCURRENTLY` cuando proceda y migración compatible con el mecanismo Prisma/operativo. Probar en dump sanitizado y PostgreSQL local con datos parecidos.
5. Proporcionar reporte de migración, rollback seguro antes del corte y procedimiento de forward-fix. No revertir datos irreversibles ni cambiar ledger.

## 5. Diseño de módulos y responsabilidades

Mantener límite de tres módulos nuevos por feature según Artículo VII. Propuesta inicial: ampliar `auth` (OAuth/identity/session), ampliar `users` (nickname/legacy link), y añadir `event-access` (allowlist y autorización por evento). Si la operación de email puede residir razonablemente en MailService y los controllers existentes, no crear módulo aparte. Cualquier cuarto módulo requiere registro de complejidad y justificación previa.

- Controller: DTO, HTTP, códigos y delegación.
- Servicio de identidad: verificar proveedor mediante cliente oficial, resolver/sincronizar relación en transacción y emitir tokens.
- Servicio de perfil: validar/actualizar apodo autenticado.
- Servicio de acceso de evento: CRUD administrativo y consulta de permiso en rutas de evento.
- Guard de evento: compone sesión + alcance explícito; no reemplaza roles donde se requiere ADMIN/STAFF.
- Frontend services: cliente API, sesión, login/logout/refresh, perfil y administración. Vistas coordinan flujo; no acceden directamente a Firebase ni almacenan autoridad.

## 6. Contrato HTTP que debe cerrarse

La tabla de rutas y cuerpos se define línea por línea en `contracts/identidad-compartida.md`. Borrador de recursos:

- `POST /auth/google` o endpoints de inicio/callback OAuth: vía exacta pendiente.
- `GET /me`: devuelve `id`, email, nombre, `nickname`, roles, status, `nicknameRequired` y eventos permitidos sin enumerar datos sensibles de otros.
- `PATCH /me/nickname`: modifica solo usuario actual; errores de validación/colisión estables.
- `GET /events` o `GET /me/events`: lista de eventos con permiso actual.
- Rutas de dominio por evento: exigen evento explícito y autorización backend.
- `GET/POST/PATCH/DELETE /admin/event-access`: ADMIN, correo normalizado, uno/múltiples UUID de evento, expiración y revocación según contrato.
- `POST /admin/event-access/:id/invitations`: emite correo; whitelist debe existir; token expira en tres días. No se incluye reenvío.
- `POST /auth/external-invitation/consume` solo si el flujo de desafío de correo se aprueba; no asumir endpoint hasta definir ownership.

Definir para cada endpoint auth/rol/scope, status, ejemplo, errores, validación, idempotencia/reintento, privacidad anti-enumeración, rate limits, efectos transaccionales y comportamiento concurrente. Documentar en OpenAPI con DTO de request/response concretos, no objetos genéricos.

## 7. Secuencia de entrega con puertas

### Fase 0 — Cerrar producto y compatibilidad

Definir requisitos de perfil por evento, evidencia de titularidad externa, formato básico de invitación, estrategia de sesión cross-origin y destino OAuth. Inventariar APIs/modelos para modularización y política de auditoría. El estado al vincular ya está decidido: conservarlo y seguir bloqueado. No tocar datos compartidos.

**Salida:** cero decisiones que cambien forma de tablas o contrato; ADR para identidad y eventos; excepción/constitución revisada.

### Fase 1 — Especificación ejecutable

Terminar contrato OpenAPI y modelo lógico; generar matriz endpoint→actor→evento→respuesta/error; describir cada migración y backfill. Desglosar pruebas contractuales/integración/seguridad. Validación del responsable y fase Red obligatorias conforme Artículos III/IX.

**Salida:** pruebas aprobadas, fallando por ausencia de función nueva; análisis SDD sin tarea sin requisito ni requisito sin prueba/tarea.

### Fase 2 — Persistencia compatible

Crear migración expansiva; tablas identidad y whitelist; nickname con canonical key; tabla/eventos base; `event_id` nullable en entidades aprobadas; backfill de evento legado; constraints compuestas, índices y checks. No modificar migraciones ya aplicadas. Validar con copia sanitizada.

**Salida:** consultas de integridad devuelven cero huérfanos/duplicados y rollback/forward-fix revisado.

### Fase 3 — Identidad y sesión backend

Configurar verificador Google detrás de interfaz simple y proveedor oficial; validar issuer/audience/nonce/CSRF/exp/hd. Resolver cuentas nuevas/existentes transaccionalmente, bloquear disabled, preservar roles/estado, proteger concurrencia. Emitir sesión backend y añadir perfil nickname. El método local actual sigue cubierto hasta decisión de migración de usuarios.

**Salida:** contrato auth y `/me` cumplidos; no se puede obtener cuenta con email claim sin token válido.

### Fase 4 — Whitelist, evento y correo

Implementar autorización explícita por evento, selección de ambos por defecto y cambio/revocación; comprobación backend para cada recurso. Añadir invitación básica por correo a whitelist existente, hash de token, expiry 3 días, uso único y rate limit; sin resend/tracking. Reutilizar MailService con plantilla y entrega fuera de transacción.

**Salida:** un correo no autorizado o revocado no accede; el enlace solo no permite entrar; sin elevación de rol.

### Fase 5 — Innovation Week

Inventariar cambios activos antes de editar. Remover Firebase de dependencias/servicio/variables solo cuando `rg` y build confirmen cero consumidores; integrar Google button con API, restauración de sesión, apodo obligatorio inicial, estados de error, avatar 2D opcional y continuar sin avatar. Mostrar admin solo si `/me` devuelve rol permitido; quitar selector demo como autoridad. Consumir contenido real solo para contratos acordados; no migrar mocks funcionales sin alcance aprobado.

**Salida:** registro/login/refresh/logout y recarga desde origen autorizado funcionan; avatar opcional; no se pierde draft/identidad locales.

### Fase 6 — Modularidad de dominio y segunda web

Aplicar event scope en servicios/consultas y terminar migración de todas las entidades de la matriz. Añadir datos de ambos eventos y rutas/selección en UX admin. TEDxUCB consume el mismo auth/profile y su propio event context. No integrar ranking cruzado. Revisar queries administrativas para filtrar evento y minimizar datos.

**Salida:** pruebas con dos eventos demuestran aislamiento lectura/escritura, identificadores locales independientes y usuario compartido.

### Fase 7 — Cierre y preparación de despliegue

Preparar runbook de OAuth, allowed origins/redirect URIs, secretos por entorno, rotación, TLS, cookies/storage, migración y rollback; comprobar condiciones/costos Google vigentes con quien administre el proyecto. Definir mecanismo de auth/claim del servicio avatar y migración guest; solo activar recuperación persistente cuando esté aprobado. Resolver auditoría pendiente y aprobación de privacidad.

**Salida:** gates de seguridad y release aprobados; no queda migración destructiva ni endpoint sin contrato.

## 8. Mapa inicial de propiedad por evento

| Dato/recurso | Propiedad prevista | Validación necesaria |
|---|---|---|
| Usuario, Google subject, email, nickname | Global | Unique global, una cuenta compartida |
| Autorización externa | Por correo y evento | FK evento, revocación y expiración explícitas |
| Perfil personal | Global inicialmente | Campos requeridos pueden variar por evento |
| Event, contenido, speakers, applications | Por evento donde el producto lo permita | Confirmar semillas, rutas y restricciones globales actuales |
| Activity, categoría de actividad | Por evento; confirmar si categoría es compartible | `event_id` y coherencia de referencias |
| Attendance/check-in | Por actividad/evento y usuario | Único dentro del alcance del evento |
| Ledger/transacciones/leaderboard | Por evento vía actividad/transacción | No sumar puntos de otro evento; preservar append-only |
| Selección/cupos/entrada | Por evento | Coherencia de run, actividad, alumno y capacidad |
| Avatar 2D | Propiedad de cuenta, proveedor independiente | Claim seguro servicio a servicio, pendiente |

No codificar una fila del mapa hasta completar lectura de schemas, SQL, endpoints y datos reales existentes.

## 9. Riesgos y controles

- **Toma de cuenta por correo coincidente:** solo sub Google y prueba de titularidad suficiente; flujo externo queda cerrado hasta resolver proveedor de email.
- **Acceso confundido con participación:** scope de evento habilita recursos únicamente; elegibilidad/perfil, aprobación de alumno y roles siguen independientes.
- **Cruce de eventos por ID:** compuestos/FKs y evento explícito en endpoints; prohibidas consultas por UUID aislado para recursos scoped.
- **Carreras de unicidad:** índices únicos para nickname key, provider/subject y correo/evento; probar operaciones simultáneas en PostgreSQL real.
- **Pérdida de usuarios/drafts:** backfill expand/contract, preservación de avatar, identidad y estado, migración sobre datos sanitizados antes del remoto.
- **OAuth no configurado:** variables por entorno validas; dev debe fallar con diagnóstico claro o permitir un modo de prueba aislado que no emita identidad real.
- **Sesión entre dominios:** compartir usuario no es compartir cookies cross-site; fijar arquitectura de callback/sesión tras conocer dominios definitivos.
- **Auditoría aplazada:** excepción documentada, revisión obligatoria antes de producción; nunca aplicar al ledger de puntos.
- **Datos personales:** minimizar campos devueltos y mostrar apodo/email solo según permisos necesarios.

## 10. Registro de complejidad

| Decisión | Complejidad añadida | Razón | Control |
|---|---|---|---|
| Identidad federada | Vínculo proveedor, callbacks, CSRF y cuenta existente | Una cuenta compartida sin contraseña duplicada | OAuth estándar y pruebas negativas |
| Apodo canónico | Campo de presentación y clave normalizada | Unicidad robusta entre idiomas y concurrencia | SQL unique + normalización única |
| Acceso externo por evento | Join whitelist-event-user/email y guard de scope | Un correo externo puede entrar solo a eventos seleccionados | FKs, endpoints scoped, pruebas cruzadas |
| Eventos modulares | FK, índices compuestos y backfill en varias entidades | Dos eventos coexisten sin filtrar datos | Matriz de propiedad + migración expand/contract |
| Invitación por correo | Token hash y entrega SMTP | Admin puede notificar, sin hacer del link una autorización | TTL tres días + whitelist obligatoria |
| Excepción temporal de auditoría | Desviación del Artículo V | Priorizar operación funcional solicitada | ADR/registro y gate antes de producción |

## 11. Criterios de calidad

- Cada requisito tiene endpoint/modelo/tarea/prueba trazable y cada tarea referencia un requisito.
- Módulos acotados, sin controladores con lógica de negocio, sin wrappers innecesarios, sin duplicar representación de Prisma.
- La seguridad vive en backend y restricciones; la UI nunca es autoridad.
- Migración repetible/verificable sobre fixture representativo, sin modificar historial de migraciones aplicadas.
- Tipos estrictos, respuestas/errores OpenAPI tipados, nombres consistentes, ninguna variable/función de autorización ambigua.
- Google secrets solo servidor; logs no contienen tokens, credenciales ni PII innecesaria.
- La prueba de aislamiento entre dos eventos y la de nickname concurrente usan PostgreSQL real.
- Ejecutar los checks apropiados del backend y frontend al cerrar cada fase de implementación; los checks automáticos complementan la revisión manual.

## 12. Análisis de trazabilidad SDD

| Requisitos | Persistencia/modelo | Contrato | Pruebas y tareas principales | Estado |
|---|---|---|---|---|
| RF-501–502, 506–508, 516: identidad Google, vínculo y sesión | `ExternalIdentity`, User y RefreshToken; `data-model.md` | Login/callback todavía sin forma final | T008–T009, T016–T018, T036–T040, T055–T056 | Pendiente OAuth, titulares externos y G0/G1 |
| RF-509–510: nickname global | `nickname`, `nicknameKey`, índice único | `GET/PATCH /me` | T010, T016, T019, T027, T041–T042, T057 | Implementado y probado localmente; onboarding frontend pendiente |
| RF-503–505, 515: whitelist, invitación y UI admin | Event + EventEmailAccess + token hash | CRUD admin y envío email | T012–T013, T020–T021, T029–T030, T046–T049, T058 | Pendiente validar desafío de email y contrato SMTP |
| RF-511: avatar 2D opcional | Asociación de avatar externa fuera de modelo inicial | Contrato actual no acredita propiedad | T005, T024, T060, T069 | Paso de deploy, omitir avatar permite seguir |
| RF-512–513: aislamiento modular por evento | FK/unique compuestas y backfill en modelos aprobados | Rutas scoped por evento por elegir | T002, T011, T022–T023, T031–T035, T045, T050–T051, T062–T066 | Inventario/migración bloquean entrega de datos |
| RF-514: auditoría aplazada | No se añaden eventos nuevos de esta feature | Excepción documentada, sin endpoint | T006, T052, T072 | Gate de release pendiente |

No hay RF sin tarea identificada. Las tareas de especificación (T008–T015) y la matriz de ownership (T002) todavía deben cerrarse antes de afirmar que no hay requisito sin contrato/prueba. No existen cambios de código implementados por este plan.

### Reconciliación de estado de implementación (23 de octubre de 2026)

La tabla anterior corresponde al estado inicial del plan y queda supersedida por esta verificación y por `avance-integracion-2026-10-23.md`. La implementación continúa en fase local: completar el flujo funcional en ambos frontends con backend, PostgreSQL, Redis, Mailpit y Avatar 2D locales. Después se dockerizará y se desplegará en un servidor. Vercel queda fuera de esta secuencia y Supabase productivo no se modificará.

| Área | Estado comprobado | Evidencia / gate pendiente |
|---|---|---|
| Identidad Google y sesión compartida | Implementada y probada con fixtures locales: verificación de ID token, nonce de un uso, link provider+subject, estados de cuenta, refresh/logout y respuesta de perfil/eventos. | Contratos Google y `/me` aprobados. El challenge local responde 503 mientras no haya `GOOGLE_CLIENT_ID`; falta recorrido real de navegador con proyecto Google del propietario. |
| Apodo compartido | Implementado en backend y ambos frontends; clave canónica única y validación alfanumérica. | Contratos de unicidad y onboarding aprobados en base local; recorrido OAuth real pendiente por la misma credencial. |
| Whitelist, invitación y verificación de correo | Scopes por evento, UI admin Innovation Week, enlaces por origen del evento, token hash/TTL/uso único. | Se aprobaron 43 contratos focalizados y un flujo HTTP→SMTP→Mailpit real. Falta proveedor SMTP externo/entrega controlada. |
| Avatar 2D | Puente backend de tokens cortos `claim`/`revoke`; servicio 2D conserva y vincula el draft de invitado a la identidad. | Contratos de token y pruebas del servicio local aprobados; falta validación visual con sesión Google real y despliegue coordinado. |
| Separación de datos por evento | Modelos, consultas, guards y constraints para recursos del alcance; `tedxucb` e `innovation-week` devuelven IDs distintos. | Pruebas locales por scope/evento aprobadas. La migración no se aplica a Supabase productivo; para un entorno compartido hacen falta DB separada, backup/dump revisado y plan de corte. |
| TEDx + Innovation Week | Ambos frontends usan contratos de identidad/permisos y conservan mocks/demos cuando el backend falta; programa, speakers y En Vivo incluyen rutas scoped. | Builds y verificaciones frontend aprobados; commits `36167dd` (Innovation, `main`) y `b8f00d3` (TEDx, `master`) publicados y Vercel Production `Ready`. No hay agenda/speakers publicados en la DB local. |
| Release / seguridad | No cerrado. Auditoría diferida se mantiene como gate; secretos y CORS del servidor final no se configuran en esta etapa local. | T071/T072 siguen abiertos hasta OAuth real, SMTP externo, revisión operativa y Docker en un servidor. Vercel no forma parte del plan actual; no modificar Supabase productivo. |

Backend: build aprobado; suites de backend previas 70/70 y 396/396, más la prueba SMTP local agregada 1/1. La última corrida focalizada de identidad/apodo/scope/avatar fue 43/43. Todos los resultados usan PostgreSQL/Redis/Mailpit locales.

### Actualización local: OAuth y administradores (2026-10-23)

- El Client ID Web recibido está configurado únicamente en los archivos locales ignorados del backend y ambos frontends. El backend devuelve `200` al reto Google; una credencial ficticia ya pasa de `GOOGLE_AUTH_UNAVAILABLE` a `INVALID_GOOGLE_CREDENTIAL`, lo que confirma que la audiencia está configurada. No se imprimió ni guardó el ID en archivos versionados.
- TEDx e Innovation Week sirven el bundle con el mismo Client ID; ambos orígenes pasan CORS. La prueba real requiere una interacción Google en el navegador y que el proyecto OAuth tenga guardados los orígenes locales y los usuarios de prueba.
- `.env.admin.local` (ignorado por Git) contiene la allowlist local. `ADMIN_EMAILS` se limita al backend; una autenticación Google permitida asigna rol `ADMIN` y los dos permisos (`tedxucb`, `innovation-week`) de forma transaccional e idempotente. La prueba usa un correo sintético y no replica el correo personal en código fuente.
- Backend compilado; contratos focalizados de identidad/admin: 5 suites y 34 pruebas aprobadas, más 2 suites/17 pruebas tras aislar los tests de configuración y Google. El build de Innovation Week pasó con 34 pruebas; TEDx pasó typecheck, lint y build (dos warnings `<img>` previos); Avatar 2D pasó verify (22 pruebas de dominio/servicio y builds).
- Los cinco servicios locales responden en 3100/3000/5173/4002/5175. No se tocó Supabase productivo. Sigue pendiente realizar el inicio Google real desde navegador y repetir el conjunto completo de regresión del backend tras la provisión de admin.

### Verificacion local actualizada (23 de octubre de 2026)

- Se mantiene la configuracion local compartida de Google, el allowlist administrativo del backend y los dos procesos frontend; challenge Google responde HTTP 200 y CORS admite ambos origenes locales. La interfaz GIS abre el flujo oficial sin error de origen, pero la credencial/callback de una sesion humana sigue pendiente.
- Innovation Week: typecheck, lint, pruebas (43/43), aislamiento y build aprobados. El flujo demo de invitado abre y guarda un avatar anonimo en el servicio 2D local (guest y avatar HTTP 201, preview HTTP 200), sin errores JavaScript ni solicitudes fallidas.
- TEDx: typecheck, lint sin errores, build y 6/6 pruebas aprobados. Backend: ultima regresion completa documentada, 71/71 suites y 410/410 pruebas; build aprobado. SMTP local con Mailpit y contratos por evento ya constan en el seguimiento.
- Pendiente para terminar el flujo local completo: login interactivo de Google para verificar callback, alta/vinculo, ADMIN, apodo y avatar vinculado/recuperable. Proveedor SMTP externo y Docker/servidor pertenecen a la fase posterior acordada. No tocar Supabase productivo.