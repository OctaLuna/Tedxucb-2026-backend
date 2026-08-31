# 001-b — Implementación de Identidad y usuarios

## Contexto

Requiere que `001-a-clarify-plan-tasks.md` ya se haya ejecutado: este prompt
no existe con contenido propio de tareas porque `specs/001-identidad-y-usuarios/tasks.md`
todavía no existe cuando se escribió. **No inventes tareas aquí** — al
ejecutar este prompt, lo primero es abrir `specs/001-identidad-y-usuarios/tasks.md`
(ya generado por `001-a`) y trabajar sobre sus IDs reales.

También requiere `00-bootstrap-infraestructura.md` ejecutado (proyecto
NestJS + Prisma + Docker Compose ya existentes).

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/seguridad-y-roles/SKILL.md`
(este módulo es, casi entero, autenticación/roles/datos personales — no es
opcional aquí).

## Qué hacer

1. Confirma el/los módulo(s) que `specs/001-identidad-y-usuarios/plan.md`
   definió en su Registro de complejidad (máximo 3, Artículo VII). Si el plan
   definió más de un módulo, **divide este trabajo**: implementa el primero
   con este prompt y crea `001-c-implementacion-<modulo>.md`,
   `001-d-...` etc. — copia la estructura de este archivo, cambiando solo la
   sección "Qué hacer" con las tareas del módulo correspondiente. No intentes
   meter dos módulos en un mismo cierre de commit.
2. Sigue `tasks.md` de 001 en su orden declarado (contratos → pruebas →
   modelo → implementación → integración → pulido). Artículo III de
   `memory/constitution.md`: las pruebas se escriben primero, se confirma que
   fallan (fase Red), y solo entonces el código.
3. Presta atención particular a:
   - RF-104/104a/122-127 (auto-registro y verificación de identidad) — es el
     requisito más citado en `CLAUDE.md` como fuente de todas las decisiones
     "raras" del proyecto: sin verificación real, cualquiera se auto-otorga
     acceso al ranking.
   - RF-115 (staff no accede al listado global de alumnos ni al ranking) —
     failure mode explícito a probar, no solo a implementar.
   - RF-118 (deshabilitar preserva historial) y RF-119 (nunca cero
     administradores activos) — invariantes, no casos felices.
   - Artículo V: hashing de contraseñas (Argon2id, según
     `.claude/skills/seguridad-y-roles/SKILL.md`), tokens de sesión
     revocables, ningún secreto fuera de variable de entorno.

## Pruebas y cierre

Sigue el **cierre estándar** de `prompts/README.md`:

1. Pruebas Jest (contrato + integración + unitarias) del/los módulo(s) de
   001, contra PostgreSQL real.
2. Prueba E2E de Playwright: `tests/e2e/<modulo>.e2e.spec.ts` cubriendo al
   menos el flujo de auto-registro completo (registro → verificación de
   correo → cuenta pendiente sin acceso → aprobación → acceso activo) y el
   rechazo de correo no institucional. Corrige cualquier fallo antes de
   cerrar.
3. Actualiza `docs/progress.md` (fila `001-b`, más las filas `001-c...` que
   hayas creado si el módulo se dividió) y marca `001` con Implementación ✅
   en "Estado por feature" solo cuando **todos** sus módulos estén hechos.
4. Commit(s) por módulo, ejemplo:
   ```
   feat(users): RF-104 RF-122-127 auto-registro con verificación de identidad
   test(users): pruebas de contrato y E2E del flujo de auto-registro
   ```
