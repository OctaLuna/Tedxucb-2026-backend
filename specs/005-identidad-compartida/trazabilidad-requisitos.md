# Trazabilidad de RF-501–RF-517

Revisión de código y evidencia local: 26 de octubre de 2026. La tabla enlaza el requisito aceptado con su implementación y la prueba más directa. «Local comprobado» no significa OAuth humano, SMTP externo, despliegue ni aprobación constitucional de release.

| RF | Capacidad requerida | Implementación fuente | Evidencia principal | Estado |
|---|---|---|---|---|
| RF-501 | Verificar ID token antes de resolver usuario | `src/modules/auth/google-auth.service.ts`; `google-auth-library` | `tests/unit/auth/google-id-token-verifier.spec.ts`; `tests/contract/auth-google.contract.spec.ts` | Local comprobado; falta login humano |
| RF-502 | Dominio UCB exacto y Workspace acreditado | `GoogleAuthService.login()` | Casos `hd` y dominio parecido en `auth-google.contract.spec.ts` | Local comprobado |
| RF-503 | Acceso externo condicionado por evento; default de UI ambos | `src/modules/event-access/event-access.service.ts`; `src/modules/auth/google-auth.service.ts` | `admin-event-access.contract.spec.ts`, `me-events.contract.spec.ts`, `event-scope.contract.spec.ts` | Local comprobado |
| RF-504 | Grant por email normalizado, sin rol implícito | `event-access.service.ts`; `SetEventAccessDto` | Whitelist no crea usuario/rol: `admin-event-access.contract.spec.ts` | Local comprobado |
| RF-505 | Invitación email, whitelist previa, TTL de 3 días y sin reenvío | `src/modules/auth/identity-email.service.ts` | `identity-email.contract.spec.ts`; `identity-email-delivery.integration.spec.ts`; smoke API→SMTP→Mailpit 26 oct | Local comprobado; SMTP externo pendiente |
| RF-506 | Prueba de titularidad externa ligada a identidad/correo, un uso | `identity-email.service.ts`; modelo `ExternalEmailProof` | Casos nonce, hash, vencimiento, consumo, revocación y replay en `identity-email.contract.spec.ts` | Local comprobado; enlace con cuenta humana pendiente |
| RF-507 | Vincular cuentas existentes preservando estado; nunca reactivar DISABLED | `GoogleAuthService.linkAndIssue()` | `auth-google.contract.spec.ts`: PENDING/REJECTED/INVITED/DISABLED | Local comprobado |
| RF-508 | Idempotencia y carreras de identidad | `GoogleAuthService.linkAndIssue()`; uniques `UserIdentity` | Login repetido y dos altas concurrentes en `auth-google.contract.spec.ts` | Local comprobado |
| RF-509 | Apodo global obligatorio para completar onboarding | `AuthService.updateNickname()`; `User.nickname` | `profiles-nickname.contract.spec.ts`; pruebas `IdentityPortal` y `AuthProvider` de los frontends | Local comprobado |
| RF-510 | 3–24 letras/números Unicode, NFKC, clave canónica única | `AuthService.updateNickname()`; índice `users_nickname_key_key` | Límites, charset, normalización, colisión y carrera en `profiles-nickname.contract.spec.ts` | Local comprobado |
| RF-511 | Avatar 2D opcional, propiedad validada por servicio | `src/modules/auth/avatar-bridge-token.service.ts`; contrato del servicio `avatar-2d` | `avatar-bridge-token.contract.spec.ts`; pruebas dominio/servicio del repo Avatar | Local comprobado; prueba visual autenticada pendiente |
| RF-512 | Autorizar cada operación según evento | Guards/servicios por módulo, incluido `EventAccessGuard` y `EventIdAccessGuard` | 17 suites de aislamiento reunidas en `event-scope.contract.spec.ts` y contratos relacionados | Local comprobado |
| RF-513 | Coexistencia e integridad entre eventos | `prisma/schema.prisma`; migraciones compuestas y triggers | `npm run test:migrations:local`: 28 migraciones, ledger/hash, FKs/uniques y cero huérfanos | Fixture local comprobado; rollout sobre datos compartidos pendiente |
| RF-514 | Excepción temporal de auditoría acotada a esta feature | [ADR-010](../../docs/decisiones/ADR-010-identidad-compartida-y-auditoria-temporal.md) | Revisión y decisión constitucional antes de release | Excepción documentada; aprobación de release pendiente |
| RF-515 | Administración de grants, invitación, scopes y revocación | `event-access.controller.ts`; `identity-email.controller.ts`; `EventAccessAdmin.tsx` de Innovation Week | `admin-event-access.contract.spec.ts`; `EventAccessAdmin.test.tsx`; entrega local Mailpit | Local comprobado |
| RF-516 | Innovation Week y TEDx usan backend compartido; Firebase retirado | `UserContext`/`IdentityPortal` de Innovation Week; `AuthProvider`/`AuthModal` TEDx | pruebas frontend auth/onboarding y búsqueda de referencias Firebase en ambos repos | Integración local comprobada |
| RF-517 | Allowlist privada concede ADMIN + ambos eventos | `ConfiguredAdminAccessService`; `ADMIN_EMAILS` backend-only | Caso allowlist de `auth-google.contract.spec.ts`; env schema y guía `quickstart.md` | Local comprobado; primer login humano pendiente |

## Gates que impiden declarar terminado el release

1. Completar un login interactivo desde ambos orígenes con cuenta autorizada y observar sesión, permisos, apodo compartido y recuperación/vinculación del avatar 2D.
2. Configurar proveedor SMTP externo y confirmar una entrega controlada. Mailpit ya valida el envío local.
3. Revisar formalmente riesgos operativos y la excepción de auditoría del RF-514. La matriz no sustituye la aceptación del responsable.
4. Docker/servidor y migración solo después de validar backup, base aislada, plan de corte, CORS/orígenes y persistencia. Supabase productivo no se usa para esta verificación.

## Límite de la evidencia automatizada

Los contratos de auth usan fixtures para probar reglas de cuenta y concurrencia; el test de proveedor nuevo firma JWT RS256 localmente y ejecuta el verificador real de `google-auth-library`, incluyendo firma, issuer, audience, expiración y nonce. Los casos de dominio, `hd` y correo verificado se prueban en el contrato de auth con claims de fixture. Ninguna prueba local demuestra que el OAuth Client ID tenga todos los orígenes/dominios autorizados ni sustituye el consentimiento interactivo.

La revisión de riesgos operativos y sus controles/gates está en [revision-riesgos-local-2026-10-26.md](./revision-riesgos-local-2026-10-26.md); no implica aceptación de riesgos productivos.
