# 001-d — Implementación de Identidad y usuarios — módulo `profiles`

## Contexto

Requiere `001-c-implementacion-users.md` ejecutado: las tablas
`student_profiles`, `faculties`, `careers`, `consent_versions`,
`consent_acceptances` ya existen (migradas en `001-c`, porque el
auto-registro las necesitaba antes de que este módulo exista) y `users`
está completo con roles. Este módulo agrega el CRUD/consulta que faltaba
sobre esas tablas — no crea tablas nuevas.

También requiere `00-bootstrap-infraestructura.md` ejecutado.

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/seguridad-y-roles/SKILL.md`.

## Qué hacer

1. Confirma que este es el tercer y último módulo de `001` según
   `specs/001-identidad-y-usuarios/plan.md`. Al cerrarlo, marca `001` con
   Implementación ✅ en "Estado por feature" de `docs/progress.md` — es el
   único de los tres prompts que corresponde tocar esa columna, porque los
   otros dos módulos ya deben estar cerrados.
2. Sigue `specs/001-identidad-y-usuarios/tasks.md`: Grupo 1 restante
   (T010-T013: perfil propio y avatar, listado de alumnos con filtros +
   403 de `STAFF`, catálogo de facultades/carreras, versiones de
   consentimiento) y Grupo 6 completo (T060-T067).
3. Presta atención particular a:
   - RF-112 (bloqueo de `studentCode`/`careerId` tras `ACTIVE` — se
     corrige solo vía `POST /me/correction-requests` de `users`, nunca
     editable directo en `PATCH /me/profile`).
   - RF-113/114/115 (listado y detalle de alumnos exclusivo `ADMIN`, `403`
     explícito a `STAFF`) — reutiliza `RolesGuard` de `auth`
     (`src/modules/auth/guards/roles.guard.ts`), no inventes un guard
     nuevo; es el failure mode a probar, no solo a implementar.
   - RF-120 (exportación tabular, queda auditada — acceso masivo a datos
     personales, Artículo V).
   - RF-128 (consentimiento configurable y versionado; una sola versión
     activa a la vez, `POST /consent-versions` desactiva la anterior en la
     misma transacción — el índice único parcial `one_active_consent_version`
     ya existe desde la migración de `001-c`).
   - Skill `seguridad-y-roles`: subida de avatar con validación de **tipo
     real** del archivo (no solo la extensión), tamaño máximo, renombrado
     en el servidor — un archivo inválido no debe alterar el avatar
     existente (Historia 2, escenario 3).
   - Redis es un recurso real compartido entre archivos de prueba — limpia
     `rate-limit:*` en el `beforeEach` si alguna prueba nueva pasa por un
     endpoint con límite de frecuencia (ver
     `tests/support/redis-test-client.ts`).
4. Paquete nuevo necesario aquí, no antes: soporte de subida de archivos
   (`FileInterceptor` de `@nestjs/platform-express`, ya instalado — evalúa
   si además hace falta un paquete de sniffing de tipo real como
   `file-type`, o si basta con los límites de `multer` + una verificación
   de cabecera de archivo; decide y documenta el porqué).

## Pruebas y cierre

Sigue el **cierre estándar** de `prompts/README.md`:

1. Pruebas Jest (contrato + integración + unitarias) de este módulo,
   contra PostgreSQL real.
2. Prueba E2E de Playwright: `tests/e2e/profiles.e2e.spec.ts` cubriendo
   perfil propio, avatar inválido sin alterar el existente, listado de
   alumnos con filtro y el `403` de `STAFF` (Historia 2 escenario 3,
   Historia 3). Corrige cualquier fallo antes de cerrar.
3. Actualiza `docs/progress.md` (fila `001-d`, y la columna
   "Implementación" de la feature `001` a ✅).
4. Commit(s) por módulo, ejemplo:
   ```
   feat(profiles): RF-110-114 perfil propio, avatar y listado de monitoreo
   feat(profiles): RF-115-116 RF-120 RF-128 catálogo, exportación y consentimiento
   test(profiles): pruebas de contrato y E2E de perfil y monitoreo
   ```

## Nota para cuando se cierre `001` por completo

Los Grupos 7 (integración cruzada), 8 (anomalías) y 9 (pulido) de
`tasks.md` no quedan asignados a ninguno de los tres módulos — van a
necesitar, después de este prompt, un `001-e-integracion-y-pulido.md` que
siga el mismo patrón que `003-d-integracion-y-pulido.md`. No lo crees
todavía si no te lo piden explícitamente; solo no lo dejes caer en
silencio al cerrar este prompt.
