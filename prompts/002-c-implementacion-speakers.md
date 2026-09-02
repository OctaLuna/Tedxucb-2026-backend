# 002-c — Implementación de Speakers y postulaciones

## Contexto

Requiere `002-a-clarify-plan-tasks.md` ya ejecutado (para tener
`specs/002-sitio-publico/tasks.md` con IDs reales) y
`00-bootstrap-infraestructura.md` ejecutado. `specs/002-sitio-publico/plan.md`
definió 2 módulos para esta feature; `002-b-implementacion-sitio-publico.md`
ya implementó el primero (`content`: Evento + bloques de contenido). Este
prompt implementa el segundo y último: `speakers` (fichas de speaker +
postulaciones + su panel de revisión).

**No depende de las tablas de `content`** (`plan.md`: "ninguno depende del
otro dentro de la feature") — técnicamente podría ejecutarse antes que
`002-b`, pero conviene después porque comparte el mismo `tasks.md` y porque
`002-b` ya resolvió cualquier fricción de infraestructura nueva (variables de
entorno, patrón de subida de imagen) que este módulo reutiliza igual.

## Skills a cargar

`.claude/skills/modulo-backend/SKILL.md`, `.claude/skills/contratos-api/SKILL.md`,
`.claude/skills/pruebas/SKILL.md`, `.claude/skills/seguridad-y-roles/SKILL.md`
(postulaciones manejan datos personales de postulantes — correo, afiliación —
y el panel admin expone fichas sin publicar; no es opcional aquí).

## Qué hacer

1. Sigue `specs/002-sitio-publico/tasks.md` en orden, **solo** los grupos de
   `speakers`: Grupo 1 (subconjunto: pruebas T006-T012, las de `speakers`/
   `applications`, no las de `content` que ya cerró `002-b`), Grupo 2
   (migraciones T022-T023 de `speakers`/`speaker_applications`, más la parte
   de T024 que quedó pendiente: publicar un speaker incompleto, doble
   conversión concurrente de una postulación — la parte de `events` ya la
   cubrió `002-b`), Grupo 4 (T040-T044, fichas de speaker), Grupo 5
   (T050-T054, postulaciones), Grupo 6 (T060-T062, `MailModule` nuevo en
   `src/common/mail/` — confirmar primero si `002-b` ya lo creó por algún
   motivo; si no, es responsabilidad de este prompt).
2. Integración (Grupo 7): T072-T075 (Historia 3, Historia 4, concurrencia de
   doble conversión, duplicados por correo — T070/T071 de Historia 1/2 ya
   los cerró `002-b`).
3. Pulido (Grupo 8): T080-T082 completos — es el último módulo de la
   feature, así que el checklist de salida a producción (T082) ya puede
   cubrir también SMTP real, no solo lo pendiente de `content`.
4. Presta atención particular a:
   - RF-207/RF-208 (publicación independiente por speaker, estado
     "próximamente" sin ninguno publicado) — probar explícitamente que un
     speaker no publicado no es visible **por ningún medio** (ni endpoint
     directo por ID) — controladores públicos y admin físicamente separados
     (Artículo V, ver `plan.md`).
   - RF-212 (señuelo anti-bot + `RateLimitGuard`, sin captcha por ahora,
     decisión ya tomada en `plan.md`) y RF-213 (confirmación por correo
     encolada con BullMQ, nunca síncrona ni bloqueante — un fallo del SMTP
     no puede impedir que la postulación quede registrada).
   - RF-215 (convertir postulación aceptada en ficha de speaker sin
     recapturar datos) — endpoint de acción dedicado
     (`POST /applications/:id/convert-to-speaker`), transacción completa,
     mapeo de campos ya definido en `plan.md`.
   - `MailModule`: SMTP genérico vía `nodemailer`, nuevas variables de
     entorno (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
     `MAIL_FROM`) en `env.validation.ts` — este mismo módulo desbloquea
     después el envío pendiente de invitación/verificación/recuperación de
     `001` (no es parte de este prompt, solo queda desbloqueado).

## Pruebas y cierre

Cierre estándar de `prompts/README.md`:

1. Pruebas Jest (contrato + integración + unitarias) contra PostgreSQL real.
2. Prueba E2E de Playwright: `tests/e2e/speakers.e2e.spec.ts` cubriendo al
   menos: un speaker no publicado no aparece en el listado público ni por
   ID directo; una postulación válida se confirma por correo (o deja rastro
   verificable si el envío real no se puede probar en el entorno de
   pruebas — no bloquees el módulo por eso, pero dilo explícitamente al
   cerrar); conversión de postulación aceptada a speaker sin recapturar
   datos.
3. Actualiza `docs/progress.md` — marca `002` con Implementación ✅ en
   "Estado por feature" (es el segundo y último módulo de la feature).
4. Commit(s), ejemplo:
   ```
   feat(speakers): T040-T054 fichas de speaker y postulaciones
   feat(speakers): T060-T062 MailModule y confirmación por correo
   test(speakers): T006-T012 T024 T072-T075 pruebas de contrato, integración y E2E
   ```
