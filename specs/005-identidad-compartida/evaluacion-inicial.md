# Evaluación inicial para la integración

**Alcance:** inspección estática del backend, migraciones y frontend de Innovation Week. No se consultaron ni modificaron datos de Supabase. Las propuestas deben validarse sobre una base aislada con datos representativos antes de migrar.

## Identidad y sesiones existentes

- `src/modules/users/registration.service.ts` crea usuario `PENDING`, rol `ALUMNO`, perfil estudiantil y aceptación de consentimiento en una transacción; exige carrera, código, periodo y teléfono. La verificación de correo o aprobación manual activa la cuenta. El registro con Google que solo pide apodo necesita un camino de identidad separado: no fabricar un perfil estudiantil ni relajar requisitos de los flujos que necesitan dicho perfil.
- `src/modules/auth/auth.service.ts` autentica correo/contraseña y deniega estados distintos de `ACTIVE`. La invitación actual activa cuentas de staff al establecer contraseña; no es la invitación externa del nuevo flujo.
- `prisma/migrations/20260831193111_init_auth_tables/migration.sql` limita `registration_source` a `SELF_REGISTRATION` y `ADMIN_CREATED`. La migración `20260904173817_fix_disable_invited_user_status_check` exige contraseña salvo en `INVITED` o `DISABLED`. Una cuenta Google activa sin contraseña requiere modificar explícitamente ambos CHECK con pruebas de regresión; la nulabilidad declarada en Prisma no es suficiente.
- `OneTimeTokenService` exige `userId`, invalida tokens pendientes del mismo tipo y usa una duración global de siete días. No usarlo sin adaptar la semántica para una invitación externa que puede preceder la cuenta y vence en tres días.
- `JwtAuthGuard` valida firma y vencimiento pero usa el estado y roles contenidos en el JWT; no consulta cambios posteriores en la base. La autorización por evento debe evaluar el acceso vigente en cada operación protegida, y el contrato debe precisar qué ocurre al deshabilitar una cuenta con JWT vigente. `TokenPairService` comprueba estado al renovar, rota refresh tokens y revoca la familia si detecta reutilización.
- `bootstrap.ts` configura un único `CORS_ORIGIN`; el soporte de dos orígenes y, si se eligen cookies, sus credenciales y protección CSRF, requiere configuración explícita por entorno.

## Aislamiento de eventos y migración

- `one_published_event` impone un único evento publicado. `EventsService`, `SelectionService` y `EntriesService` buscan el evento publicado sin identificador: retirar solo el índice produciría selecciones ambiguas.
- `ContentBlock.key` y `ActivityCategory.name` son únicos globales; `Activity`, `Speaker` y contenido carecen de `eventId`. Inventariar consumidores, restricciones, datos existentes y reglas de unicidad antes de sustituir índices. Mantener compatibilidad de rutas hasta migrar sus consumidores.
- `Selection.runId` es nullable: las asignaciones manuales no tienen una ruta hacia `Event`. El índice `one_active_selection_per_student` es global, y el conteo de capacidad, búsquedas de entrada y exportaciones también son globales. Cada selección, incluida la manual, necesita una pertenencia explícita y verificable al evento; se deben clasificar registros heredados antes del backfill.
- `StudentProfile.totalPoints` es un único valor global. `LeaderboardService` ordena por esa caché y desempata usando todas las transacciones del alumno; `SelectionService` consume ese ranking. La separación exige una proyección por usuario y evento y filtrar también desempates, historial, exportaciones, reconciliación y selección.
- `PointTransaction.activityId` es nullable: ajustes administrativos y algunas reversiones no permiten inferir evento solo desde actividad. El trigger de solo inserción prohíbe actualizar transacciones existentes. Se necesita diseñar una asignación histórica inmutable y verificable, o un procedimiento de migración explícitamente aprobado que conserve el ledger; no plantear un backfill `UPDATE` como solución automática.
- `LedgerService` aplica `Math.max(0, total + points)` en cada movimiento. Por tanto, sumar los puntos sin considerar el orden no reproduce siempre la caché: una penalización seguida de un abono puede producir un resultado distinto. Es necesario resolver esta discrepancia con la invariante del Artículo IV y el requisito de no negatividad, con datos y pruebas de regresión antes de elegir algoritmo o migración.

## Frontend y avatar

- La raíz de la aplicación está en `innovation-week-landing/frontend`. `UserContext.tsx` recupera una identidad de demostración desde `localStorage`; no constituye autenticación. `IdentityPortal/index.tsx` abre el editor 2D directamente y todavía no implementa el paso de Google ni apodo.
- El checkout de Innovation Week contiene numerosos cambios locales, incluidos `UserContext`, `IdentityPortal`, componentes de acceso, administración y almacenamiento de identidad. Inspeccionar y preservar esos cambios antes de intervenir; los permisos del workspace deben permitir las escrituras en ese repositorio.
- `services/firebase.ts` inicializa Firebase; comprobar referencias, dependencias y variables antes de retirarlo. `config/avatarProviders.ts` aún menciona 2D y 3D, aunque el portal actual selecciona 2D. No borrar datos locales existentes al pasar al proveedor requerido.

## Decisiones de implementación y puertas

1. El apodo usa las reglas de producto acordadas y el máximo técnico de 24 caracteres propuesto en el plan; se adoptó al autorizar el usuario las decisiones de implementación autónoma.
2. El usuario institucional obtiene identidad con Google verificado, pero la creación del perfil de alumno y la participación competitiva requieren un contrato específico. La experiencia básica no debe inventar datos para cumplir FKs.
3. Para cuentas externas, Google puede no ser autoridad del buzón: el vínculo por correo requiere demostrar control del buzón además de validar Google. El vínculo conserva los estados y roles existentes.
4. Antes de cualquier escritura al esquema, resolver la atribución de transacciones históricas, selecciones manuales y la discrepancia de puntaje; después ensayar con PostgreSQL aislado y una copia sanitizada. No ejecutar migraciones sobre Supabase como parte de la evaluación.
5. Las pruebas se desarrollan primero y se presentan para revisión según el Artículo III de `memory/constitution.md`. Los resultados de infraestructura se distinguen de una fase Red que falle por comportamiento ausente.

## Trazabilidad inicial

| Trabajo | Evidencia | Estado |
|---|---|---|
| T002: inventario completo | Schema, restricciones y rutas críticas identificadas arriba; falta clasificar cada tabla, trigger, consulta y seed | En curso |
| T003: sesiones y orígenes | Guards, refresh y CORS inspeccionados; falta decidir flujo, cookies y orígenes definitivos | En curso |
| T004: registro e invitaciones existentes | Flujos y restricciones principales identificados; falta matriz completa de transiciones y roles | En curso |
| T053: preservar checkout frontend | Estado observado; hay cambios locales extensos | Evaluado; repetir `git status` inmediatamente antes de editar |

## Verificacion agregada de la base conectada (solo lectura, 2026-10-23)

Se consultaron unicamente conteos, estados y relaciones estructurales dentro de una transaccion PostgreSQL `READ ONLY`; no se seleccionaron correos, nombres de personas, cuerpos de postulacion ni otros campos de PII. La base conectada tiene una fila de evento publicada (`TEDxUCB`), una fila de contenido (`linea_tematica`), tres postulaciones `PENDING` sin speaker convertido, un usuario activo `ADMIN_CREATED`, y cero filas actuales en speakers, actividades, categorias, perfiles estudiantiles, asistencias, transacciones de puntos, corridas o selecciones. La migracion registra solo las nueve migraciones legacy hasta `20260908120000`; las migraciones de esta feature no se aplicaron alli.

Esto permite una estrategia de backfill deterministicamente comprobable para las filas legacy existentes: vincular el bloque y las tres postulaciones al unico evento TEDx publicado. El backfill debe comprobar dentro de la propia migracion que existe exactamente ese evento y detenerse si el conteo o estado difiere. Las tablas vacias no prueban que cualquier futura operacion de puntos sea segura: deben nacer con `eventId` y relaciones compuestas. Esta evidencia no autoriza aplicar migraciones ni escribir datos en esa base.
