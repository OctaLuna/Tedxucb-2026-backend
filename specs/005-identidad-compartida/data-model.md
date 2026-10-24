# Modelo lógico: identidad y propiedad por evento

**Estado:** diseño lógico sujeto al inventario completo de migraciones/datos. No es SQL listo para producción. Los nombres son provisionales hasta revisión con Prisma 7 y constraints existentes.

## Principios

1. Identidad personal y apodo son globales; autorización, participación y contenidos operativos tienen evento explícito.
2. Email se normaliza con la utilidad actual antes de toda lectura/escritura y se mantiene restricción única global de usuario.
3. Subject Google es estable; email no es la PK de identidad externa.
4. El motor de PostgreSQL asegura unicidad y coherencia ante concurrencia. Las preconsultas de aplicación solo mejoran mensajes.
5. Evento forma parte de FK, índice y consulta en cada entidad scoped. Validación de aplicación aislada no basta para impedir relaciones cruzadas.
6. Migraciones aditivas, backfill verificable y estrategia expand/contract; ningún dato de ledger se actualiza/elimina.

## Entidades globales

### User (existente, extensión propuesta)

Campos actuales: `id`, `email`, `passwordHash?`, `fullName`, `status`, `registrationSource`, fechas y relaciones.

Añadir:

| Campo | Tipo lógico | Regla |
|---|---|---|
| `nickname` | texto nullable al inicio | Forma mostrada; 3 a 24 caracteres Unicode alfanuméricos normalizados |
| `nicknameKey` | texto nullable en backfill | NFKC + lowercase Unicode; unique global parcial mientras null |

La obligatoriedad se activa gradualmente solo para la población definida por producto. No inventar apodos ni romper staff/admin ya existente. Evaluar unicidad reservada: si nulo permitido, migrar usuarios existentes sin apodo; alta del primer flujo exige apodo antes de acceso completo.

### ExternalIdentity (nueva, propuesta)

| Campo | Regla |
|---|---|
| `id` UUID PK | Identidad de asociación interna |
| `userId` UUID FK `users.id` ON DELETE CASCADE | Una persona puede tener más de un proveedor en el futuro solo si se autoriza; no construir UI futura |
| `provider` texto | Por ahora `GOOGLE`; check limitado a proveedores implementados |
| `subject` texto | Claim `sub`, case-sensitive; nunca email |
| `createdAt`, `updatedAt` timestamptz | UTC |

Constraints: unique `(provider, subject)`; índice `(user_id, provider)`; FK e integridad de actualización. Si una persona solo puede tener un Google subject, unique `(provider,user_id)` también. La reasignación requiere desafío/autorización probados; no exponer CRUD público de identidades.

## Event (existente, extensión/refactor)

Identificador UUID persistente. Añadir slug único estable (`tedxucb`, `innovation-week`) y campos actuales. Revisar CHECK de estados y eliminar `one_published_event` únicamente después de reemplazar comportamiento de `GET /public/event`, caché y selección de frontend por contexto event. Publicar varios eventos no elimina orden ni estado de publicación individual.

La semilla para eventos es idempotente: upsert por slug, preservar contenido/configuración. Nunca depender de UUID hard-coded en los frontends.

## Whitelist: EventEmailAccess (nueva, propuesta)

Preferir tabla de autorización por evento:

| Campo | Regla |
|---|---|
| `id` UUID PK | Recurso administrable |
| `emailNormalized` text | Normalizador compartido de email |
| `eventId` UUID FK `events.id` | Evento específico |
| `createdAt`, `updatedAt` timestamptz | Fechas de autorización |
| `revokedAt` nullable timestamptz | Nulo = activa |
| `expiresAt` nullable timestamptz | Nulo = sin caducidad; no confundir con invitación de email |
| `createdById` nullable FK users | No usarlo para insertar auditoría si excepción aprobada |

Unique parcial `(email_normalized,event_id) WHERE revoked_at IS NULL` o modelo que permite reactivar misma fila; decidir con queries de administración. Índice `(event_id,email_normalized)` para autorización. La operación de alta default expande los dos slugs a dos filas en una transacción. Cambiar scope se hace como conjunto atómico: añadir/quitar filas, sin ventana temporal de acceso accidental.

**No contiene role ni `userId` requerido.** La whitelist puede anteceder la cuenta. Luego de verificación, se consulta por email canónico. Si el usuario cambia email, decidir transferencia/actualización y revalidación; no conceder permiso por alias anterior.

## Invitación externa básica

No reutilizar `INVITATION` hasta comprobar constraints y semántica de token existente (requiere `userId` y `createdBy`). Opción preferida inicial: tipo nuevo de token o entidad separada `ExternalInvitation` con:

- `id`, `emailNormalized`, `eventIds` representados por filas de acceso ya existentes, `tokenHash UNIQUE`, `createdById`, `expiresAt = createdAt + 3d`, `consumedAt?`, fechas.
- No hay `resendCount`, tracking o estado de aceptación en primera entrega.
- Whitelist se confirma en DB antes de llamar al MailService, fuera de transacción. Si email falla, autorización manual queda activa; devolver `deliveryStatus: FAILED` u operación explícita de reintento aún pendiente. No implementar resend control sin decisión.
- El enlace no agrega permiso; si whitelist se revoca, token no la restaura.

Validar si un token de invitación necesita consumo si solo abre onboarding. Nunca registrar token en texto ni URLs en logs. TTL de 3 días en base y en la verificación del servicio.

## Matriz de propiedad para revisión pre-migración

| Modelo | Alcance esperado | Acción necesaria |
|---|---|---|
| `User`, `UserRole`, `RefreshToken`, `AuthToken`, `ExternalIdentity` | Global | No `eventId`; conservar identidad y controles existentes |
| `StudentProfile`, `Faculty`, `Career`, `ConsentAcceptance` | Perfil global inicialmente, elegibilidad puede ser por evento | Decidir si career/consent es compartido; no duplicar PII sin necesidad |
| `Event` | Raíz scoped | Slug único; quitar índice de único publicado global; APIs públicas por slug |
| `ContentBlock`, `Speaker`, `SpeakerApplication` | Contenido/postulación probablemente scoped | Añadir event FK; mover índices únicos a compuesto; backfill TEDx |
| `ActivityCategory`, `Activity` | Scoped o catálogo global reutilizable | Resolver ownership; si catálogo scoped, FK compuesta `(event_id,category_id)` |
| `ActivityStaff` | Asignación a actividad scoped | Consistencia del evento derivada de activity FK |
| `Attendance` | Asistencia a activity y student | Constraint asegura student/profile y activity; evento por actividad |
| `PointTransaction` | Ledger global append-only; ownership por evento en `PointTransactionEventOwnership` | La tabla lateral identifica el evento sin `UPDATE` al ledger; trigger asigna ownership y actualiza proyección en la inserción |
| `EventStudentPoints` | Proyección derivada por evento y perfil | Trigger transaccional mantiene saldo con truncamiento a cero; ranking/progress no leen el total global del perfil |
| leaderboard/progress | Vista scoped | Leer saldo y desempate solo del evento solicitado; listar perfiles activos con cero puntos |
| `SelectionRun`, `Selection` | Scoped por evento | `Selection.eventId`, FK compuesta run/event y unicidad activa por `(eventId, studentId)`; cupo, entrada y export filtrados |
| `Entry/QR` | Token de usuario + evento/selección | Incluir/validar event scope si su uso no es global |
| `ConsentVersion` | `TBD`, posiblemente por evento | Mantener versionado sin autorizar participación en otro evento |

Matriz completa se obtiene inspeccionando todos los modelos Prisma, migrations SQL, índices/triggers, seed, controladores/servicios/DTO y consultas de admin. Cada modelo recibe decisión `GLOBAL`, `EVENT_SCOPED` o `DERIVED`; no se deja tabla sin clase.

## Transición de datos

1. Exportar esquema, conteos, IDs y claves únicas de la base de prueba/producción read-only; quitar PII antes de fixture local.
2. Upsert de raíz TEDx e Innovation Week. Determinar a cuál evento pertenecen filas actuales usando contenido, actividad y configuración; ambigüedad reportada en CSV anonimizado, no adivinada.
3. Backfill de event_id solo para registros inequívocos. Validación: `event_id IS NULL`, referencia huérfana, colisiones de clave por evento, objetos enlazados a eventos distintos, conteo por tabla antes/después.
4. Resolver colisiones renombrando claves de contenido cuando producto apruebe; no eliminar filas. Rehacer unique indexes como compuestos.
5. Verificar FK en cada arista. Migrar publicaciones, endpoints públicos y cachés en aplicación antes de remover índice global.
6. Marcar NOT NULL, validar constraints, y retirar temporalmente compatibilidad solo después de confirmar ambos despliegues usan scope.

## Normalización del apodo

La validación vive en el servicio de identidad; la DB mantiene el valor canónico persistido para que el índice único sea efectivo. Admitir entre 3 y 24 letras y números Unicode tras normalización NFKC; rechazar símbolos, espacios y controles. Comparar sin distinguir mayúsculas. No confiar en collation implícita del host PostgreSQL para garantizar equivalencia.

## Decisi�n aplicada al ledger (2026-10-23)

`point_transactions` conserva su trigger append-only y nunca se modifica para a�adir el evento. `point_transaction_event_ownership` registra una pertenencia inmutable por movimiento; la migraci�n agrega esas relaciones como filas nuevas, derivando el evento desde `activity_id` o asignando los ajustes legados a TEDx. Un trigger `AFTER INSERT` toma `ted.event_id` (establecido por la operaci�n autorizada) o, para compatibilidad de llamadas antiguas, resuelve TEDx. La misma transacci�n actualiza `event_student_points` con el truncamiento a cero que usa el libro global.

La proyecci�n se reconstruye por movimiento usando `created_at, id` para un orden estable; los empates hist�ricos de `created_at` no guardan secuencia de inserci�n y el UUID queda como desempate determinista. El saldo por evento nuevo ya no depende de ese supuesto: el trigger lo mantiene seg�n el orden serializado de inserciones. Reconciliaci�n de la proyecci�n y su reporte quedan en el checklist de release.
