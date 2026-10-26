# Modelo de datos implementado: identidad compartida y eventos

**Revisión:** 26 de octubre de 2026. Este documento describe el estado funcional local de la feature 005. `prisma/schema.prisma` y las migraciones SQL son la fuente de verdad del DDL; [matriz-alcance-modelos.md](./matriz-alcance-modelos.md) contiene el inventario de los 34 modelos y la clasificación GLOBAL / EVENT_SCOPED / DERIVED. El documento de diseño inicial fue reconciliado aquí para no presentar entidades propuestas como si fueran el esquema vigente.

## Identidad global

- `User` representa a la persona, con correo único, estado, roles y apodo. `nicknameKey` es una clave canónica única global; el onboarding exige de 3 a 24 letras o números Unicode y normaliza NFKC.
- `UserIdentity` vincula el proveedor `GOOGLE` y su `sub` estable con un usuario. La base impone unicidad por `(provider, subject)` y `(userId, provider)`; el email no identifica el subject.
- `ExternalEmailProof` acredita el par subject/correo de proveedores que no son autoridad suficiente sobre ese mailbox. El token se persiste como hash, expira y se consume una vez.
- `UserRole`, `RefreshToken` y `AuthToken` son globales. Tener un rol global no concede acceso a cada evento; todo recurso operativo protegido valida aparte el grant o el scope.
- `Faculty`, `Career`, `StudentProfile` y consentimientos mantienen su alcance global actual, sujeto a las decisiones de producto futuras sobre elegibilidad/consentimiento por evento.

## Raíz y datos de evento

- `Event` identifica cada evento con UUID y slug estable (`tedxucb`, `innovation-week`). El seed resuelve por slug y es idempotente; los frontends no codifican UUID.
- `EventEmailAccess` guarda una fila por correo normalizado y evento. La whitelist puede existir antes del usuario; `revokedAt` controla el grant. No contiene rol ni prueba titularidad.
- `IdentityInvitation` guarda email, evento, hash del token, vencimiento y consumo. Su TTL es tres días; invitar no crea cuenta ni grant y el consumo vuelve a comprobar el acceso del mismo evento.
- `ContentBlock`, `Speaker`, `SpeakerApplication`, `EventProgramItem`, `EventLiveSettings`, `EventLiveActivity`, preguntas/opciones/media, `ActivityCategory`, `Activity`, `SelectionRun` y `Selection` tienen propiedad por evento explícita o una relación compuesta que la deriva sin ambigüedad.
- Staff, asistencia y entradas heredan el evento de la actividad o selección asociada y sus guards vuelven a validar el permiso vigente.

## Ledger y proyecciones derivadas

- `PointTransaction` es el ledger global append-only: las migraciones y operaciones no lo editan para asignarle un evento.
- `PointTransactionEventOwnership` agrega la propiedad inmutable de cada movimiento por evento; `EventStudentPoints` mantiene el saldo/proyección por estudiante y evento.
- Ranking, progreso, ajustes, selección, capacidad y export consultan el evento explícito. Constraints compuestas y triggers rechazan relaciones cruzadas y preservan la atribución histórica.

## Invariantes y operación

1. Toda identidad Google validada es única por proveedor/subject; el enlace a cuenta existente preserva estado y privilegios existentes. `DISABLED` nunca se reactiva por login.
2. Una allowlist no equivale a identidad, rol ni sesión. El grant es por correo/evento y se valida en cada operación privada.
3. Toda relación entre dos recursos scoped incluye evento en FK/constraint o deriva el scope de una relación ya restringida. La autorización en servicios complementa, no sustituye, las constraints.
4. El ledger original es inmutable. La proyección por evento puede reconciliarse desde ownership; cualquier reconciliación debe quedar validada antes del corte.
5. Las migraciones locales vigentes pasan el fixture de dump/restauración: 28 migraciones al 26 de octubre, filas TEDx legacy, ledger/hash, constraints compuestas y cero huérfanos.
6. La prueba anterior no certifica una operación online sin bloqueo ni compatibilidad entre versiones durante un deploy. T031 permanece abierto: antes de usar una base compartida hay que definir ventana de mantenimiento o dividir expand, backfill, validación y contract en migraciones ensayadas sobre dump representativo.
7. Supabase productivo no es un destino de prueba. Datos reales requieren dump revisado, respaldo, conteos/relaciones comparados y plan de corte aprobado.

## Referencias

- DDL: [`prisma/schema.prisma`](../../prisma/schema.prisma)
- Clasificación de modelos y superficie de rutas: [`matriz-alcance-modelos.md`](./matriz-alcance-modelos.md)
- Reglas HTTP y errores: [`contracts/identidad-compartida.md`](./contracts/identidad-compartida.md)
- Migración/fixture local: [`seguimiento-integracion-local.md`](./seguimiento-integracion-local.md)
- Requisitos y evidencia por requisito: [`trazabilidad-requisitos.md`](./trazabilidad-requisitos.md)
