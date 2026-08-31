# Plan de implementación: Identidad, usuarios y perfiles

**Basado en:** `specs/001-identidad-y-usuarios/spec.md`
**Stack propuesto por el usuario:** NestJS + TypeScript + PostgreSQL + Prisma,
monolito modular (acordado en la conversación previa a la adopción de SDD)

> Este documento se mantiene de alto nivel. El esquema detallado está en
> `data-model.md`, los contratos de API en `contracts/`, y los escenarios de
> validación manual en `quickstart.md`.

## Resumen técnico

Esta feature es la base de todo el sistema: `002`, `003` y `004` asumen que
`001` ya sabe quién es cada persona, con qué rol y con qué nivel de confianza.
El diseño gira alrededor de una tensión central que introdujo la decisión de
auto-registro (ADR-005): la organización dejó de controlar la puerta de
entrada, así que el sistema tiene que sostener por sí solo la legitimidad de
quién puede acumular puntos.

Tres capas resuelven esa tensión. Primero, **verificación en el registro**: una
cuenta de alumno nace `PENDING` y no puede acumular puntos hasta que se
verifica la titularidad de un correo del dominio institucional. Segundo,
**unicidad al nivel del motor**: el correo (comparado sin distinguir mayúsculas)
y el código de registro son únicos en toda la tabla, sin excepción por estado,
así que ni un rechazo ni una deshabilitación liberan esos valores para un
segundo intento fraudulento. Tercero, **revisión humana**: como no existe un
padrón institucional contra el cual validar automáticamente (ver ADR-007), la
tercera barrera es que el administrador pueda revisar, aprobar, rechazar y
deshabilitar registros — esto deja de ser una pantalla secundaria y pasa a ser
infraestructura antifraude de primera línea.

La segunda mitad del diseño es el modelo de sesión. Un JWT de acceso vive 15
minutos; un refresh token rotativo, persistido y revocable sostiene la sesión
real. Reutilizar un refresh ya usado revoca toda la familia de tokens de ese
usuario — la señal más clara de que alguien más tiene una copia. El mismo
mecanismo de "token de un solo uso con vencimiento" se reutiliza, con un
discriminador de tipo, para invitaciones, verificaciones de correo y
recuperaciones de contraseña: los tres son, en la letra del propio RF-108, la
misma regla aplicada a tres disparadores distintos.

Roles múltiples (RF-102) se modelan como una relación real, no como una
etiqueta: un usuario puede ser alumno y staff a la vez, y retirar un rol no
debe poder dejar el sistema sin ningún administrador activo — esa invariante
vive en el motor, no en la disciplina del código de aplicación, porque es
exactamente el tipo de condición de carrera que un `SELECT` previo en el
servicio no protege.

## Fase -1: Gates previos a la implementación

### Gate de simplicidad (Artículo VII)

- [x] ¿Se usan ≤3 proyectos/módulos? — Sí, 3: `auth`, `users`, `profiles`. Se
      validó explícitamente la hipótesis de 2 módulos (`users`+`profiles`) y se
      decidió sumar `auth` como módulo propio: es un dominio técnico distinto
      (hashing, JWT, guards) del CRUD de la entidad Usuario, invocable sin HTTP
      por derecho propio (Artículo I), y sigue el mismo precedente que llevó a
      `003` a aislar `points` de `activities`. Detalle completo en el Registro
      de complejidad.
- [x] ¿No hay future-proofing / features especulativas? — Sí. No se construye
      tabla ni importador de padrón institucional (RF-105 eliminado, ver
      ADR-007): la universidad confirmó que no existe ese archivo, y construir
      la funcionalidad "por si aparece" es exactamente el future-proofing que
      prohíbe este artículo. Tampoco se construye el job de purga de RF-121: la
      decisión tomada fue retención indefinida, no hace falta para el
      lanzamiento.

### Gate anti-abstracción (Artículo VIII)

- [x] ¿Se usa el framework directamente? — Sí. Prisma directo, sin repositorio
      encima. Passport/JWT de Nest se usan directamente para los guards.
- [x] ¿Una sola representación del modelo de datos? — Sí. Los tipos generados
      por Prisma son la representación. DTO solo donde el contrato difiere
      realmente de la entidad: por ejemplo, la respuesta de listado de alumnos
      (RF-113), que compone `student_profiles` + `users` + `careers` +
      `total_points` (este último es de `003`), o la respuesta de check-in de
      `003` que ya usa el mismo criterio.
- [x] ¿Tabla unificada de tokens de un solo uso, en vez de tres tablas
      separadas? — Sí, `auth_tokens` con discriminador `type`. Ver la fila
      correspondiente en Decisiones técnicas: es el mismo razonamiento que
      llevó a `point_transactions.type` en `003` en vez de tablas separadas por
      tipo de movimiento, y aquí el propio RF-108 ya redacta las tres cosas
      como una sola regla.

### Gate integration-first (Artículo IX)

- [x] ¿Los contratos están definidos? — Sí, en `contracts/`, antes que el
      código.
- [x] ¿Existen pruebas de contrato planeadas? — Sí, Grupo 1 de `tasks.md`.
- [x] ¿Se prueba contra servicios reales? — Sí, PostgreSQL real. La
      corrección depende de garantías que un mock no reproduce: la unicidad
      case-insensitive del correo, el trigger que impide dejar el sistema sin
      administrador activo, el índice parcial que impide dos tokens pendientes
      del mismo tipo para el mismo usuario, y el trigger que impide reabrir un
      token ya consumido.

### Cumplimiento constitucional

- [x] **I, library-first:** `AuthService`, `UsersService` y `ProfilesService`
      son invocables desde una prueba unitaria sin levantar HTTP. En
      particular, la validación de dominio institucional, el hashing y la
      verificación de tokens son funciones puras.
- [x] **II, interfaz observable:** API HTTP documentada en OpenAPI. No hace
      falta un corolario de CLI como el de `003` (no hay una operación de
      reconciliación equivalente en esta feature).
- [x] **III, test-first:** sin excepción declarada aquí — `001` no es
      check-in ni asignación de cupos — pero se sigue igual: `tasks.md` define
      el Grupo 1 como pruebas de contrato antes de cualquier implementación, y
      ninguna tarea de módulo se da por completa si esas pruebas no pasan.
- [ ] **IV, auditabilidad del puntaje:** no aplica directamente — esta feature
      no tiene ledger de puntos. Su espíritu de trazabilidad se traduce aquí en
      dos cosas: `audit_log` (RF-117) como registro inmutable de altas,
      cambios de rol y deshabilitaciones, y la inmutabilidad forzada de
      `auth_tokens` ya consumidos (un token de un solo uso que se pudiera
      "reabrir" sería el equivalente de un ledger mutable).
- [x] **V, privilegio mínimo y datos personales:** guards que verifican
      relación concreta, no solo rol (`/me/*` nunca `/students/:id/*` para
      autoconsulta); ninguna acción sensible sin auditoría; datos personales
      solo los que pide RF-110; secretos por variable de entorno validada al
      arrancar.
- [~] **VI, fiabilidad bajo condiciones de campo:** aplica parcialmente. No
      hay un presupuesto de 500ms de check-in aquí, pero CE-101 (registro en
      menos de 3 minutos, sin asistencia) es su equivalente para esta feature:
      la estrategia técnica que lo sostiene es RF-110a (el formulario no pide
      campos opcionales), no una optimización de infraestructura.

## Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué esta opción | Requisito |
|---|---|---|---|
| Módulo `auth` separado de `users` | Fusionar autenticación dentro de `users`; un único módulo `identity` | Dominio técnico distinto (hashing, JWT, guards) de la gestión CRUD de la entidad Usuario. Mantiene el Artículo I y evita un `UsersService` con demasiadas responsabilidades. Mismo precedente que la separación `points`/`activities` de `003`. | RF-107 a RF-109, RF-122 a RF-127 |
| Tabla unificada `auth_tokens` con discriminador `type` | Tres tablas separadas: `invitations`, `email_verifications`, `password_resets` | RF-108 ya redacta invitaciones, verificaciones y recuperaciones como una sola regla (un solo uso, 7 días). Mismo precedente que `point_transactions.type` en `003`: un solo lugar para expirar, consumir y revocar, en vez de triplicar la lógica de vencimiento en tres tablas. | RF-108 |
| Tabla puente `user_roles` en vez de un array `role[]` en `users` | Columna `TEXT[]` de roles; un solo rol por usuario (descartada de entrada, viola RF-102) | RF-102 exige una relación real de multiplicidad, no una etiqueta. Una relación N:M real se modela como tabla — el mismo criterio que llevó a modelar `activity_staff` como tabla en `003` en vez de un array de ids en `activities`. Además, la tabla da un lugar natural para `granted_by`/`granted_at` y para el trigger que protege RF-119. | RF-101, RF-102, RF-103, RF-119 |
| Argon2id para contraseñas | bcrypt, scrypt | Resistencia superior a ataques por GPU/ASIC; recomendación vigente de OWASP; ya establecido como estándar del proyecto en la skill de seguridad. | RF-109 |
| Token de acceso corto (15 min) + refresh rotativo persistido y revocable | Sesión de servidor tradicional (cookie + store); JWT de larga duración sin refresh | RF-109 exige sesiones revocables. Un JWT puro no se puede invalidar antes de su vencimiento. El refresh persistido y rotativo da revocabilidad real sin pagar el costo de validar contra base de datos en cada request. | RF-109 |
| Reutilizar un refresh ya usado revoca toda la familia | Ignorar el reuso; solo rotar sin revocar | Es la defensa estándar contra un refresh token capturado: si aparece una reutilización de un token ya rotado, alguien más tiene una copia, y la única respuesta segura es cerrar todas las sesiones de ese usuario. | RF-109, skill `seguridad-y-roles` |
| Se guarda el hash (SHA-256) del token de un solo uso, no el token | Guardar el token en texto plano; cifrarlo simétricamente | Si la base de datos se filtra, un token plano permite tomar cuentas de inmediato. El token ya tiene alta entropía aleatoria, así que no hace falta un hash lento tipo Argon2 como con las contraseñas: solo hace falta igualdad exacta y rápida. | Skill `seguridad-y-roles` |
| Verificación de dominio institucional en el servicio de aplicación, no como `CHECK` en `users` | `CHECK (email LIKE '%@ucb.edu.bo')` a nivel de tabla | RF-123 aplica solo al auto-registro de alumnos (RF-104), no a las cuentas de staff/admin dadas de alta por el administrador (RF-104a), que pueden no compartir dominio. Un `CHECK` de tabla afectaría a todos los usuarios por igual y rompería el alta de staff. | RF-123, RF-104a |
| `CITEXT` para `users.email` | `TEXT` + `LOWER(email)` en cada índice/consulta | Dos alumnos podrían registrar el mismo correo con distinta capitalización y crear "duplicados" técnicamente distintos, rompiendo RF-106. `CITEXT` resuelve la comparación insensible a mayúsculas de forma nativa y consistente, sin depender de que cada consulta futura recuerde aplicar `LOWER()`. | RF-106 |
| `auth_tokens.new_email` en vez de sobrescribir `users.email` de inmediato al solicitar una corrección | Cambiar el correo apenas el admin lo edita, y re-verificar después | Si el nuevo correo tiene un error de tipeo o el alumno no tiene acceso a él, no debe quedar bloqueado de su cuenta con un correo al que no puede acceder. El cambio real solo ocurre al consumir el token de verificación del nuevo correo. | RF-112a, caso límite "corrección de correo" |
| `audit_log` central, compartida entre features | Una tabla de auditoría propia por cada feature (`001`, `003`, `004`) | RF-117 pide constancia uniforme de autor/momento/detalle. Una sola tabla permite un panel único de auditoría en vez de que cada feature reinvente su propia infraestructura de trazabilidad. | RF-117, Artículo V |
| Rate limiting diferenciado por endpoint (`register`, `login`, `password-reset`) | Un único throttler global para toda la API | El endpoint público de registro es blanco de scripts de alta masiva (RF-127); el de login recibe intentos de fuerza bruta; el de recuperación recibe abuso de spam de correos. Son amenazas distintas y un límite único no sirve para las tres a la vez — mismo criterio que ya distingue el checkin del endpoint público de postulaciones en `003`. | RF-127 |

## Módulos validados

| Módulo | Responsabilidad | Dueño de tablas |
|---|---|---|
| `auth` | Login, refresh rotativo, logout, hashing Argon2id, guards (`JwtAuthGuard`, `RolesGuard`), emisión/consumo de tokens de un solo uso, rate limiting de endpoints de autenticación | `auth_tokens` |
| `users` | Entidad Usuario, roles múltiples, alta de staff con invitación, revisión de registros pendientes (aprobar/rechazar), deshabilitar/habilitar, solicitudes de corrección de campos bloqueados, auditoría | `users`, `user_roles`, `audit_log` |
| `profiles` | Perfil de alumno, avatar, catálogo de facultades/carreras, listado/detalle de monitoreo, exportación, consentimiento | `student_profiles`, `faculties`, `careers`, `consent_versions`, `consent_acceptances` |

Orden de dependencia: `auth` no depende de nadie dentro de la feature; `users`
depende de `auth` (usa su servicio de emisión de tokens para invitaciones);
`profiles` depende de `users` (un perfil de alumno no existe sin un
`Usuario`).

## Modelo de datos (resumen — detalle en `data-model.md`)

Nueve entidades. `users` y `user_roles` son la identidad y la relación de
roles, protegida por dos triggers que impiden dejar el sistema sin
administrador activo (RF-119). `auth_tokens` es la tabla unificada de
invitación/verificación/recuperación, con un índice parcial que impide dos
tokens pendientes del mismo tipo para el mismo usuario y un trigger que impide
reabrir uno ya consumido. `student_profiles` es el perfil extendido de
alumno, 1:1 con `users`, sin `total_points` — esa columna la agrega `003` vía
`ALTER TABLE`, no se declara aquí. `faculties` y `careers` son el catálogo
académico. `consent_versions` y `consent_acceptances` sostienen RF-128: el
texto de consentimiento es configurable por el administrador y versionado, y
cada aceptación queda registrada con su versión y momento. `audit_log` es la
constancia inmutable compartida por toda la feature (y, en la práctica, por
`003` y `004` también).

## Contratos (resumen — detalle en `contracts/`)

- `contracts/auto-registro-y-verificacion.md` — `POST /api/v1/auth/register`,
  `POST /api/v1/auth/verify-email`. El de mayor riesgo de fraude: contrato
  completo, con sus seis modos de fallo.
- `contracts/autenticacion-y-sesiones.md` — login, refresh, logout,
  logout-all, aceptación de invitación, recuperación de contraseña, `GET
  /me` (identidad básica de sesión).
- `contracts/usuarios-y-roles.md` — alta de usuarios por el admin (staff),
  gestión de roles, revisión de registros pendientes (aprobar/rechazar),
  deshabilitar/habilitar, solicitudes de corrección de campos bloqueados,
  consulta de auditoría.
- `contracts/perfil-y-catalogo.md` — perfil propio del alumno, avatar,
  listado/detalle de monitoreo (RF-113, RF-114), exportación (RF-120),
  catálogo de facultades/carreras (RF-116), versiones de consentimiento
  (RF-128).

## Orden de creación de archivos (test-first, obligatorio)

1. `contracts/` — especificaciones de la API
2. Pruebas de contrato, luego de integración, luego unitarias
3. Migraciones y esquema de datos
4. Código fuente que hace pasar las pruebas anteriores, en el orden `auth` →
   `users` → `profiles`

## Registro de complejidad

| Gate | Situación | Justificación |
|---|---|---|
| Simplicidad (Art. VII): la hipótesis inicial de trabajo eran 2 módulos (`users`+`profiles`) | No falla — el resultado final (3 módulos) sigue dentro del límite de la constitución, pero se documenta la razón de no quedarse en 2 | Se separa `auth` como tercer módulo porque es un dominio técnico distinto (hashing, JWT, guards, tokens de un solo uso) del CRUD de la entidad Usuario, invocable sin HTTP por derecho propio (Artículo I). Fusionarlo dentro de `users` habría producido un servicio con responsabilidades no relacionadas —el mismo síntoma que llevó a `003` a separar `points` de `activities`— y habría dificultado que `002`, `003` y `004` reutilicen sus guards sin arrastrar lógica de perfil de alumno que no les compete. |

## Validación / Quickstart (resumen — detalle en `quickstart.md`)

1. Ciclo feliz de auto-registro: completar el formulario, verificar el correo,
   ver el perfil activo.
2. Registro duplicado: mismo correo o mismo código de registro, verificar
   rechazo sin revelar datos del titular existente.
3. Dominio de correo inválido: verificar rechazo.
4. Enlace de verificación vencido: verificar el mensaje y la posibilidad de
   pedir uno nuevo.
5. Alta de staff por el admin: invitación, aceptación, cuenta activa.
6. Último administrador: intentar deshabilitarlo o quitarle el rol, verificar
   el rechazo.
7. Avatar inválido: subir un archivo que no es imagen, verificar que el avatar
   existente no cambia.
8. Roles múltiples: dar rol de staff a un alumno existente, verificar que
   conserva su perfil y puntaje; retirar el rol y verificar que solo pierde
   esos permisos.
9. Staff intentando acceder al listado global de alumnos: verificar rechazo
   (RF-115).
