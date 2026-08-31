# Tareas: Identidad, usuarios y perfiles

**Fuente:** `plan.md`, `data-model.md`, `contracts/`
**Convención:** `[P]` = paralelizable con otras `[P]` del mismo grupo (no
comparten archivos ni dependen entre sí).

Sin Grupo 0: no quedan marcadores `[NECESITA CLARIFICACIÓN]` en `spec.md`
(resueltos 2026-08-31, ver `specs/README.md`). Numeración empieza en `T001`.

---

## Grupo 1 — Contratos y pruebas (test-first, Artículo III)

Se escriben **antes** de cualquier código de implementación. Deben fallar.

- [ ] T001 [P] Prueba de contrato de `POST /auth/register` — ciclo feliz
- [ ] T002 [P] Prueba de contrato de `POST /auth/register` — los seis modos
      de fallo (foco especial: `DUPLICATE_FIELD` nunca filtra datos del
      titular existente)
- [ ] T003 [P] Prueba de contrato de `POST /auth/verify-email`, incluida la
      idempotencia de doble clic sobre un token ya consumido
- [ ] T004 [P] Prueba de contrato de `POST /auth/login`, `POST
      /auth/refresh` (incluida la revocación de familia por reuso), `POST
      /auth/logout`, `POST /auth/logout-all`
- [ ] T005 [P] Prueba de contrato de `POST /auth/accept-invitation`
- [ ] T006 [P] Prueba de contrato de recuperación de contraseña
      (`password-reset/request` y `/confirm`, incluida la no-enumeración de
      correos existentes)
- [ ] T007 [P] Prueba de contrato de alta de staff (`POST /users`) y
      gestión de roles (otorgar/retirar, incluido el rechazo por último
      administrador — RF-119)
- [ ] T008 [P] Prueba de contrato de revisión de registros pendientes
      (aprobar/rechazar — RF-126)
- [ ] T009 [P] Prueba de contrato de solicitud y resolución de corrección de
      campo bloqueado (`correction-requests`), incluido el caso especial de
      corrección de correo
- [ ] T010 [P] Prueba de contrato de perfil propio y avatar (formato/tamaño
      inválido sin alterar el avatar existente — Historia 2 escenario 3)
- [ ] T011 [P] Prueba de contrato de listado de alumnos con filtros
      (`GET /students`) y el `403` de `STAFF` (RF-115)
- [ ] T012 [P] Prueba de contrato de catálogo de facultades/carreras
- [ ] T013 [P] Prueba de contrato de versiones de consentimiento
      (`consent-versions` y la versión pública activa)
- [ ] T014 Levantar PostgreSQL real en contenedor para las pruebas
      (Artículo IX — sin mocks)
- [ ] T015 **Confirmar que T001–T013 fallan (fase Red) antes de continuar**

## Grupo 2 — Migraciones y modelo de datos

- [ ] T020 Extensión `citext`
- [ ] T021 Migración de `users` con sus `CHECK` cruzados y el trigger
      `no_disable_last_admin`
- [ ] T022 Migración de `user_roles` con el trigger
      `no_remove_last_admin_role`
- [ ] T023 Migración de `auth_tokens` con el índice único parcial de token
      pendiente por tipo y el trigger `no_reconsume_auth_token`
- [ ] T024 [P] Migración de `faculties` y `careers`
- [ ] T025 Migración de `student_profiles` (depende de `careers`)
- [ ] T026 [P] Migración de `consent_versions` (con el índice de versión
      activa única) y `consent_acceptances`
- [ ] T027 [P] Migración de `audit_log`
- [ ] T028 Prueba de integración de las restricciones: correo duplicado con
      mayúsculas distintas rechazado directamente por el motor, intento de
      dejar el sistema sin administrador rechazado por ambos triggers,
      reapertura de un token consumido rechazada
- [ ] T029 Semillas: 2-3 facultades/carreras de prueba (marcadas como tales,
      nunca en producción) y una versión de consentimiento de marcador de
      posición

## Grupo 3 — Módulo `auth` (el núcleo de seguridad)

Se implementa primero porque `users` y `profiles` dependen de sus guards.

- [ ] T030 Servicio de hashing de contraseñas con Argon2id
- [ ] T031 Servicio de emisión y verificación de par de tokens (acceso 15
      min + refresh rotativo persistido)
- [ ] T032 Revocación de familia completa de refresh tokens ante reuso
      detectado, con entrada en `audit_log`
- [ ] T033 Servicio genérico de emisión/consumo de `auth_tokens` (invalida
      el token pendiente anterior del mismo tipo al emitir uno nuevo)
- [ ] T034 `JwtAuthGuard`, `RolesGuard`
- [ ] T035 Endpoints `POST /auth/login`, `/refresh`, `/logout`, `/logout-all`
- [ ] T036 Endpoint `POST /auth/accept-invitation`
- [ ] T037 Endpoints `POST /auth/password-reset/request` y `/confirm`
      (incluido el `logout-all` implícito al confirmar)
- [ ] T038 Rate limiting diferenciado por endpoint (login, registro,
      recuperación)
- [ ] T039 Endpoint `GET /me` (identidad básica de sesión)

## Grupo 4 — Módulo `users`

- [ ] T040 CRUD de usuarios (staff/admin) por el administrador
- [ ] T041 Alta de staff con invitación (`POST /users`, usa el servicio de
      tokens de `auth`)
- [ ] T042 Otorgar/retirar rol, con traducción de la excepción del trigger a
      `409 LAST_ADMIN_STANDING`
- [ ] T043 Deshabilitar/habilitar cuenta (`POST /users/:id/disable`,
      `/enable`), mismo mapeo de `LAST_ADMIN_STANDING`
- [ ] T044 Listado de registros pendientes (`GET /students/pending`) y
      revisión (aprobar/rechazar con motivo obligatorio)
- [ ] T045 Solicitudes de corrección de campo bloqueado — creación
      (`POST /me/correction-requests`) y resolución por el admin; la
      resolución de tipo `email` crea un `auth_tokens` con `new_email` en
      vez de sobrescribir directamente
- [ ] T046 Endpoint de consulta de auditoría (`GET /audit-log`)
- [ ] T047 Registro en `audit_log` de cada acción sensible de este módulo
      (alta, edición, deshabilitación, cambio de rol — RF-117)

## Grupo 5 — Registro y verificación (satisface Historia 1)

Corresponde a `contracts/auto-registro-y-verificacion.md`, el flujo de mayor
riesgo de fraude.

- [ ] T050 `POST /auth/register` completo: los 11 pasos transaccionales del
      contrato
- [ ] T051 Validación de dominio institucional (`@ucb.edu.bo`)
- [ ] T052 Mensaje de duplicado anti-enumeración (nunca revela datos del
      titular existente)
- [ ] T053 `POST /auth/verify-email` con su comportamiento idempotente
- [ ] T054 Prueba de concurrencia con `Promise.all`: dos registros
      simultáneos con el mismo correo o código — solo uno prospera
- [ ] T055 Encolado del correo de verificación **después** de confirmar la
      transacción (nunca dentro)

**Nota de dependencia cruzada:** `003` ya reservó `T068` en su propio
`tasks.md` para rechazar el check-in de una cuenta `PENDING` (RF-122,
derivado). Esta tarea (T050) es su prerrequisito de dato: `users.status`
debe existir antes de que `003` pueda consultarlo.

## Grupo 6 — Módulo `profiles`

- [ ] T060 `GET`/`PATCH /me/profile`, con bloqueo de `studentCode`/
      `careerId` tras `status = 'ACTIVE'` (RF-112)
- [ ] T061 `POST /me/avatar`: validación real de tipo de archivo (no solo
      extensión) y tamaño, renombrado en servidor
- [ ] T062 [P] CRUD de facultades/carreras
- [ ] T063 Listado de alumnos con filtros y paginación (`GET /students`,
      RF-113)
- [ ] T064 Detalle individual (`GET /students/:id`, RF-114)
- [ ] T065 Guard que deniega a `STAFF` el listado global y el detalle
      (RF-115)
- [ ] T066 Exportación tabular (`GET /students/export`, RF-120)
- [ ] T067 [P] CRUD de `consent-versions` y endpoint público de la versión
      activa

## Grupo 7 — Integración (escenarios de aceptación del spec)

- [ ] T070 Integración: ciclo completo Historia 1 (registro → verificación
      → cuenta activa) contra base de datos real
- [ ] T071 Integración: Historia 1b (staff invitado activa su cuenta; admin
      aprueba y rechaza un registro pendiente)
- [ ] T072 Integración: Historia 2 (avatar válido/inválido sin alterar el
      existente; invitación vencida con indicación de cómo pedir una nueva)
- [ ] T073 Integración: Historia 3 (listado y filtro por el admin; `STAFF`
      denegado)
- [ ] T074 Integración: Historia 4 (rol adicional de staff sin perder
      perfil/puntaje; retiro de rol sin perder historial de validaciones)
- [ ] T075 Integración: último administrador protegido por ambas vías
      (retirar rol y deshabilitar), con peticiones concurrentes
- [ ] T076 Integración: corrección de correo — solicitud, resolución del
      admin, verificación del nuevo correo, el anterior deja de servir para
      login

## Grupo 8 — Anomalías y observabilidad

- [ ] T080 [P] Verificación end-to-end de que toda acción sensible del
      Artículo V queda en `audit_log`
- [ ] T081 [P] Métrica CE-101 (tiempo de registro) y CE-102 (tasa de
      verificación de correo)
- [ ] T082 [P] Métrica CE-103 (tasa de avatar propio) y CE-107 (cuentas
      `PENDING` por más de 7 días, visibles en el panel)
- [ ] T083 Contador simple de registros por IP — **no** duplicar la
      infraestructura de `device_hash` de `003`, que ya cubre señales de
      fraude por dispositivo a nivel de asistencias

## Grupo 9 — Pulido

- [ ] T090 [P] Ajuste final de límites de frecuencia por endpoint
- [ ] T091 [P] Documentación OpenAPI generada y verificada contra
      `contracts/`
- [ ] T092 [P] Actualizar `quickstart.md` con los pasos reales tras la
      implementación
- [ ] T093 Validación manual de campo del formulario de registro (CE-101,
      sin asistencia, cronometrado)
- [ ] T094 **Checklist de salida a producción:** cargar el catálogo real de
      facultades/carreras de la UCB, y publicar en `consent_versions` la
      versión con el texto legal real (reemplazando el marcador de
      posición) antes del lanzamiento

---

## Orden de ejecución

```
Grupo 1 (pruebas en rojo) ──> Grupo 2 (migraciones)
                                   ↓
                              Grupo 3 (auth)
                                   ↓
                              Grupo 4 (users)
                                   ↓
                              Grupo 5 (registro y verificación)
                                   ↓
                              Grupo 6 (profiles)
                                   ↓
                              Grupo 7 (integración)
                                   ↓
                          Grupos 8 y 9 (paralelizables)
```

**Regla:** ninguna tarea de los grupos 3 en adelante se marca completada si
las pruebas correspondientes del Grupo 1 no pasan. Si una tarea exige una
decisión que el plan no tomó, se vuelve a la fase Plan o se pide
clarificación, en lugar de improvisar en silencio.
