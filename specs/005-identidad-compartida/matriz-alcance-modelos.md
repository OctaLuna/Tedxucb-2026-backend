# Inventario actual de modelos y alcance por evento

Fecha de revisión: 2026-10-23. Fuente: `prisma/schema.prisma`, las migraciones versionadas, controladores/servicios de alcance y contratos de `tests/contract/event-scope.contract.spec.ts`. Este inventario describe el esquema actual; no certifica por sí solo la cobertura de cada ruta ni una migración de datos productivos.

## Modelos globales

| Modelo | Alcance y razón | Condición relevante |
|---|---|---|
| `User` | Global, una persona comparte identidad entre eventos | `email` y `nicknameKey` únicos globales |
| `UserIdentity` | Global, vínculo de proveedor y `sub` | Unique `(provider, subject)` y `(userId, provider)` |
| `ExternalEmailProof` | Global, prueba de titularidad de email para la misma identidad Google | Token hash único, vencimiento y consumo de un solo uso |
| `UserRole` | Global, roles transversales | FK a usuario; el acceso efectivo a cada evento se valida aparte |
| `AuthToken` | Global, tokens de cuenta | Hash único, FK a usuario |
| `RefreshToken` | Global, sesión compartida | Hash/familia y rotación de token |
| `AuditLog` | Global, registro operativo común | No tiene FK `eventId`; la asociación de acciones a un evento puede estar solo en `detail`/entidad y la auditoría temporal fue diferida |
| `Faculty` | Global, catálogo académico UCB compartido | Nombre único |
| `Career` | Global, catálogo académico compartido | Unique `(facultyId, name)` |
| `StudentProfile` | Perfil académico global ligado 1:1 a User | `totalPoints` conserva compatibilidad histórica; los saldos por evento viven en proyección separada |
| `ConsentVersion` | Global según alcance actual | Existe una versión activa global; consentimiento por evento sigue como decisión diferida |
| `ConsentAcceptance` | Global por alumno y versión | Unique `(studentId, consentVersionId)`; sin `eventId` |
| `CorrectionRequest` | Global, solicitud sobre perfil global | FK al perfil; sin `eventId` |

## Raíz y modelos acotados a evento

| Modelo | Alcance actual | Integridad/consulta |
|---|---|---|
| `Event` | Raíz de cada evento | Slug único; publicación independiente por slug |
| `EventEmailAccess` | Por email y evento | Unique `(emailNormalized, eventId)`; revocación por fila |
| `IdentityInvitation` | Por evento y email | FK `eventId`, token hash único, expiración de tres días y consumo único |
| `ContentBlock` | Por evento | Unique `(eventId, key)` |
| `Speaker` | Por evento | FK `eventId`, unique compuesta `(id, eventId)` |
| `EventProgramItem` | Por evento | FK compuesta a speaker del mismo evento |
| `EventLiveSettings` | Una configuración por evento | PK `eventId`; override manual apunta a actividad en vivo del mismo evento |
| `EventLiveActivity` | Por evento | Unique `(id, eventId)`; agenda asociada en el mismo evento |
| `EventLiveQuizQuestion` | Por actividad y evento | FK compuesta a actividad en vivo |
| `EventLiveQuizOption` | Por pregunta y evento | FK compuesta a pregunta |
| `EventLiveMedia` | Por actividad y evento | FK compuesta a actividad en vivo |
| `SpeakerApplication` | Por evento | FK `eventId`; índices de estado/fecha con `eventId` |
| `ActivityCategory` | Por evento | Unique `(id, eventId)` y `(eventId, name)` |
| `Activity` | Por evento | FK compuesta `(categoryId, eventId)` evita categoría cruzada |
| `ActivityStaff` | Derivado de Activity | Asignación se valida contra permiso vigente del evento y actividad |
| `Attendance` | Derivado de Activity | La pertenencia de evento se obtiene por FK compuesta a actividad; no duplica `eventId` |
| `PointTransaction` | Ledger global, inmutable | No se actualiza para agregar evento; propiedad se registra en modelo lateral |
| `PointTransactionEventOwnership` | Por movimiento y evento | Una fila de ownership por movimiento; evento inmutable |
| `EventStudentPoints` | Proyección derivada por alumno y evento | PK `(eventId, studentId)`; trigger mantiene saldo por evento |
| `SelectionRun` | Por evento | FK `eventId`; selección lo referencia con FK compuesta |
| `Selection` | Por evento | FK compuesta run/event y unicidad de selección activa por evento/alumno |

## Superficie de rutas revisada

- Contenido público, programa, speakers y En Vivo reciben slug de evento y los servicios consultan por `eventId`.
- Actividades, categorías, staff, check-in, asistencia, puntos, leaderboard, progreso, selección, export y entradas usan contexto `eventSlug` en controlador/servicio o derivan el evento desde la actividad/propiedad inmutable del ledger.
- Los guards requieren rol y permiso de evento en cada operación protegida; los endpoints de check-in requieren además asignación del staff a la actividad. `GET /events` y los endpoints administrativos de whitelist filtran operaciones al scope activo de la cuenta. Ajustes de puntos y asignación manual validan también el permiso del alumno objetivo antes de escribir.
- El leaderboard y la selección conservan el padrón global de perfiles activos, incluidos perfiles con cero puntos, según `data-model.md`; los puntos y selecciones sí quedan aislados por evento. Los contratos de evento y el flujo completo de puntos pasan en la base aislada. Las pruebas no reemplazan auditoría de todas las rutas manuales ni validación de datos preexistentes.

## Migraciones relacionadas

Las migraciones `20261023040000`–`20261023160000` introducen scopes de contenido, speakers, actividades, movimientos/proyección de puntos, selección, catálogo Innovation Week, programa, En Vivo e invitaciones por evento. Las migraciones son aditivas en local; falta completar revisión exhaustiva de backfill, conteos, huérfanos, colisiones y rollback sobre fixture sanitizado antes de cualquier uso remoto.

## Riesgos aún abiertos

1. `AuditLog` no tiene una FK común a `Event`; la excepción de auditoría queda diferida por decisión de producto.
2. Consentimientos y perfil académico siguen globales; confirmar si un evento futuro requiere políticas distintas.
3. Confirmar como decisión de producto el padrón global de perfiles activos usado por ranking/selección; evitar crear perfiles académicos a cuentas externas solo por tener whitelist.
4. Repetir la auditoría estática ruta por ruta y los checks de constraints después del resto de cambios del SDD.
5. No aplicar estas migraciones ni hacer backfill en Supabase productivo en esta etapa local.

