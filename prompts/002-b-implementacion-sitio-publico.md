# 002-b — Implementación del Sitio público

## Contexto

Requiere `002-a-clarify-plan-tasks.md` ya ejecutado (para tener
`specs/002-sitio-publico/tasks.md` con IDs reales) y
`00-bootstrap-infraestructura.md` ejecutado. No depende de que `003` esté
terminado — puede correr en paralelo a la rama `003-a..d`, solo necesita que
`001-b` (o al menos su parte de roles/autenticación de administrador) exista.

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`.

## Qué hacer

1. Confirma el/los módulo(s) que definió `specs/002-sitio-publico/plan.md`.
   Si son varios, divide igual que se explica en
   `001-b-implementacion-identidad.md` (crea `002-c-...` por cada módulo
   adicional, misma estructura).
2. Sigue `tasks.md` de 002 en orden contratos → pruebas → modelo →
   implementación → integración → pulido.
3. Presta atención particular a:
   - RF-207/208 (publicación independiente por speaker, estado
     "próximamente" sin ninguno publicado) — probar explícitamente que un
     speaker no publicado no es visible **por ningún medio** (ni endpoint
     directo por ID).
   - RF-204/205 (cuenta atrás con hora del servidor, sin negativos tras el
     evento) — prueba de contrato, no solo visual.
   - RF-212 (protección anti-spam del formulario de postulación) y RF-213
     (confirmación por correo).
   - RF-215 (convertir postulación aceptada en ficha de speaker sin
     recapturar datos) — es una transformación de datos existentes, no un
     formulario nuevo.

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Pruebas Jest (contrato + integración + unitarias) contra PostgreSQL real.
2. Prueba E2E de Playwright: `tests/e2e/<modulo>.e2e.spec.ts` cubriendo al
   menos: la cuenta atrás responde con la hora del servidor; un speaker no
   publicado no aparece en el listado público; una postulación válida se
   confirma por correo (o al menos deja rastro verificable si el envío de
   correo no está implementado todavía — no bloquees el módulo por eso, pero
   dilo explícitamente al cerrar).
3. Actualiza `docs/progress.md` — marca `002` con Implementación ✅ solo
   cuando todos sus módulos estén hechos.
4. Commit(s), ejemplo:
   ```
   feat(speakers): RF-206-209 fichas de speaker con publicación independiente
   test(speakers): pruebas de contrato y E2E de visibilidad por estado
   ```
