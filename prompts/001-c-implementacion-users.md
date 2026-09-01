# 001-c — Implementación de Identidad y usuarios — módulo `users`

## Contexto

Requiere `001-b-implementacion-identidad.md` ejecutado: el módulo `auth`
(hashing Argon2id, `TokenPairService`, `OneTimeTokenService` genérico,
`JwtAuthGuard`/`RolesGuard`) ya existe y este módulo lo consume directamente
por import — en particular `OneTimeTokenService` para invitaciones y
verificación de correo, y los guards para proteger sus propios endpoints.
No reimplementes nada de `auth`.

También requiere `00-bootstrap-infraestructura.md` ejecutado.

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/seguridad-y-roles/SKILL.md`
(este módulo es, casi entero, autenticación/roles/datos personales — no es
opcional aquí).

## Qué hacer

1. Confirma en `specs/001-identidad-y-usuarios/plan.md` que este es el
   segundo de los 3 módulos (`users`), tal como quedó dividido por
   `001-b-implementacion-identidad.md`.
2. Sigue `specs/001-identidad-y-usuarios/tasks.md` en su orden declarado
   (Artículo III: pruebas primero, confirmar fase Red, solo entonces el
   código). Este módulo cierra:
   - Grupo 1, lo que falta de `auth`: T001-T003 (auto-registro y
     verify-email, los seis modos de fallo del registro) y T007-T009 (alta
     de staff/roles, revisión de pendientes, correction-requests).
   - Grupo 2, lo que falta: T024 (faculties/careers — solo el catálogo
     mínimo para que el registro valide `careerId`; el CRUD de admin sobre
     ese catálogo es de `profiles`), T025 (student_profiles), T026
     (consent_versions/consent_acceptances), T029 (semillas de prueba: 2-3
     facultades/carreras marcadas como tales + una versión de consentimiento
     placeholder).
   - T028, la parte que falta: correo duplicado ya se probó en `001-b`;
     agrega aquí `studentCode` duplicado y la versión de consentimiento
     activa única (`one_active_consent_version`).
   - Grupo 4 completo: T040-T047.
   - Grupo 5 completo: T050-T055 — el auto-registro
     (`POST /auth/register`, `POST /auth/verify-email`), el flujo de mayor
     riesgo de fraude del proyecto. Aunque su ruta vive bajo `/auth/*`, la
     lógica (crear `users` + `student_profiles` + `consent_acceptances` +
     emitir el `auth_tokens` de verificación, todo en una transacción) es de
     este módulo — `auth` solo presta su `OneTimeTokenService`.
   - Agrega en el guard de límite de frecuencia (`src/common/rate-limit/`,
     ya construido por `auth`) el límite propio de `POST /auth/register`
     (RF-127, valor inicial sugerido 5/IP/hora, configurable por variable de
     entorno) — la infraestructura ya está lista, solo falta decorar el
     endpoint nuevo.
3. Presta atención particular a:
   - RF-104/104a/122-127 (auto-registro y verificación de identidad) — el
     requisito más citado en `CLAUDE.md` como fuente de todas las
     decisiones "raras" del proyecto: sin verificación real, cualquiera se
     auto-otorga acceso al ranking.
   - RF-106 (unicidad de correo y código de registro, sin excepción por
     estado — ni `REJECTED` ni `DISABLED` liberan el valor).
   - RF-118 (deshabilitar preserva historial) y RF-119 (nunca cero
     administradores activos) — invariantes, no casos felices: prueba los
     dos triggers (`no_disable_last_admin`, `no_remove_last_admin_role`)
     con peticiones concurrentes, no solo secuenciales (ver el patrón ya
     usado en `tests/integration/auth-db-constraints.integration.spec.ts`
     de `001-b`).
   - Artículo V: cada acción sensible de este módulo (alta, edición,
     deshabilitación, cambio de rol, aprobación/rechazo, resolución de
     corrección) queda en `audit_log`, sin excepción.
   - RF-112a: resolver una corrección de tipo `email` crea un
     `auth_tokens` con `new_email`, nunca sobrescribe `users.email`
     directo — reutiliza `OneTimeTokenService.issue()` de `auth`.
   - `email` se normaliza siempre con
     `src/common/utils/normalize-email.util.ts` antes de escribir o
     consultar (el motor exige `CHECK (email = lower(email))` — ver la nota
     de diseño en `prisma/schema.prisma`, no se usó `citext` porque Prisma
     excluye por completo los campos `Unsupported` de su API tipada).
   - Redis es un recurso real compartido entre archivos de prueba — si
     alguna prueba nueva usa límite de frecuencia, limpia las claves
     `rate-limit:*` en el `beforeEach` (ver
     `tests/support/redis-test-client.ts`, ya construido por `001-b`).

## Pruebas y cierre

Sigue el **cierre estándar** de `prompts/README.md`:

1. Pruebas Jest (contrato + integración + unitarias) de este módulo,
   contra PostgreSQL real.
2. Prueba E2E de Playwright: `tests/e2e/users.e2e.spec.ts` cubriendo al
   menos el flujo de auto-registro completo (registro → verificación de
   correo → cuenta pendiente sin acceso → aprobación por el admin → login
   exitoso tras la aprobación) y el rechazo de correo no institucional
   (Historia 1, escenarios 1 y 4), más el alta de staff por invitación
   (Historia 1b) hasta login exitoso. Corrige cualquier fallo antes de
   cerrar.
3. Actualiza `docs/progress.md` (fila `001-c`).
4. Commit(s) por módulo, ejemplo:
   ```
   feat(users): RF-104 RF-122-127 auto-registro con verificación de identidad
   feat(users): RF-101-103 RF-117-119 alta de staff, roles y revisión de pendientes
   test(users): pruebas de contrato y E2E del flujo de auto-registro
   ```
