# 002-a — Clarify, Plan y Tasks del Sitio público

## Contexto

`specs/002-sitio-publico/spec.md` no depende del motor de puntos y puede
publicarse mucho antes que el resto (así lo recomienda `specs/README.md`) —
por eso conviene ejecutar este prompt en paralelo a la rama `003-*`, en
cuanto `001-a`/`001-b` estén listos (el sitio público solo necesita el rol
administrador de 001 para su panel de gestión de contenido). Tiene 5
marcadores `[NECESITA CLARIFICACIÓN]`, coincide con lo que declara su propio
checklist.

Igual que en `001-a`: no escribas código de implementación en este prompt.
El objetivo es dejar `002` con `plan.md` + `data-model.md` + `contracts/` +
`tasks.md` completos.

## Skill a cargar

`.claude/skills/spec-workflow/SKILL.md`.

## Paso 1 — Clarify

Marcadores abiertos en `specs/002-sitio-publico/spec.md` (verifica que sigan
ahí antes de preguntar):

1. RF-213: ¿el correo de confirmación de postulación anuncia plazos o
   próximos pasos? ¿Cuáles?
2. RF-217: ¿la universidad exige un nivel formal de accesibilidad (p. ej.
   WCAG 2.1 AA)?
3. RF-219: ¿el equipo tiene el manual de marca TEDx y sus restricciones de
   uso del logotipo? Es requisito de la licencia, no estético.
4. RF-220: ¿se publicará agenda/programa del evento, y en qué momento?
5. CE-201: ¿cuál es la meta real de postulaciones de speakers y la fecha de
   cierre?

Una sola ronda alcanza (son 5, el máximo permitido). Al resolver cada una,
sigue el mismo procedimiento que describe `001-a-clarify-plan-tasks.md`
(reemplazar marcador, fechar, registrar en `specs/README.md`, ADR si es
estructural — RF-219 sobre todo, si hay restricciones legales de marca, bien
podría merecer uno).

## Paso 2 — Plan

Gates de Fase -1 contra `memory/constitution.md`. Este spec es el más
orientado a contenido público de las cuatro (temática, speakers, cuenta
atrás, postulaciones) — presta atención al Artículo VI (fiabilidad de campo:
RF-216 exige que funcione bien en móvil) y al Artículo VII (no construir
gestión de contenido genérica tipo CMS — RF-203 pide "editable sin
desplegar código", no "un CMS completo").

Hipótesis de módulos a validar (máximo 3): algo como `content` (temática,
cuenta atrás, configuración del evento) y `speakers` (fichas de speaker +
postulaciones + su panel de revisión). Podría caber en un solo módulo si el
gate de simplicidad lo prefiere así — la cuenta atrás y la temática son
prácticamente estáticas.

Escribe `plan.md`, `data-model.md` (Evento, Speaker, Postulación de speaker,
Bloque de contenido) y `contracts/` (rutas públicas bajo `/api/v1/public/*`
— revisa la sección "Endpoints públicos" de
`.claude/skills/contratos-api/SKILL.md`: rate limit propio, captcha en el
formulario de postulación por RF-212).

## Paso 3 — Tasks

`tasks.md` con el mismo formato y orden que `specs/003-motor-de-puntos/tasks.md`.
Recuerda que la cuenta atrás (RF-204) se calcula con la hora del servidor, no
del cliente — eso es una prueba de contrato, no un detalle de frontend.

## Cierre

1. Actualiza `docs/progress.md`: fila `002-a` → ✅ hecho; `002` con Plan ✅ y
   Tasks ✅; entrada en la Bitácora.
2. Commit, ejemplo:
   ```
   docs(sitio-publico): resuelve marcadores de clarify y agrega plan/tasks de 002
   ```

Ver `prompts/README.md` para la convención de commits completa.
