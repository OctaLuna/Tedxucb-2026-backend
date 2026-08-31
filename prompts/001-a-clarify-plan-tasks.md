# 001-a — Clarify, Plan y Tasks de Identidad y usuarios

## Contexto

`specs/001-identidad-y-usuarios/spec.md` es la base de la que dependen las
otras tres features (roles, autenticación, perfil de alumno). Hoy solo tiene
`spec.md`: sin `plan.md`, `data-model.md`, `contracts/` ni `tasks.md`. Tiene
7 marcadores `[NECESITA CLARIFICACIÓN]` en el cuerpo del documento (el
checklist del spec declara 8 — verifica ese desfase al tocar el documento, es
posible que sea un marcador que quedó sin escribir).

No escribas código todavía. El objetivo de este prompt es dejar `001` en el
mismo punto en que ya está `003`: con `plan.md` + `data-model.md` +
`contracts/` + `tasks.md` completos, listos para que `001-b` implemente sobre
tareas reales.

## Skill a cargar

`.claude/skills/spec-workflow/SKILL.md` completa — este prompt sigue al pie
de la letra sus fases "Clarify", "Plan" y "Tasks".

## Paso 1 — Clarify

Los marcadores abiertos en `specs/001-identidad-y-usuarios/spec.md` (cita
literal, verifica que sigan ahí antes de preguntar — pueden haberse resuelto
entre que se escribió este prompt y que se ejecuta):

1. Corrección de correo de un alumno ya activo: ¿puede el alumno cambiarlo
   él mismo, o solo el administrador?
2. RF-108: ¿cuántos días de validez tienen invitaciones/verificación/
   recuperación?
3. RF-123: ¿cuál es el dominio exacto de correo institucional? ¿Todos los
   alumnos tienen uno activo o algunos usan correo personal?
4. RF-125: ¿existe un padrón exportable de alumnos habilitados? Si no,
   decidir si el administrador revisa los registros manualmente.
5. RF-110 (restricciones alimentarias): ¿habrá servicio de alimentos en el
   evento? Si no, ese campo sobra.
6. RF-128: ¿la universidad tiene un texto de consentimiento de datos/imagen
   ya aprobado?
7. RF-121: ¿qué plazo de retención de datos personales define la
   universidad tras el 9 de noviembre?

Pregúntaselas al usuario **en rondas de máximo 5**, empezando por las que
más bloquean aguas abajo (108, 123 y 125 primero — condicionan todo el flujo
de auto-registro; 110 y 128 después — afectan el formulario; 121 al final —
afecta solo retención, no el desarrollo inmediato). Al resolver cada una:

1. Reemplaza el marcador por el requisito decidido en `spec.md`.
2. Anota la fecha de la decisión junto al requisito.
3. Registra la decisión en la tabla de `specs/README.md` ("Decisiones
   tomadas"); si es estructural (p. ej. afecta el modelo de datos o
   introduce una obligación legal nueva), crea un ADR en
   `docs/decisiones/` siguiendo el formato de los ADR-001 a 006 existentes.
4. Actualiza el conteo del checklist del propio `spec.md`.
5. Revisa si la respuesta abrió requisitos nuevos (pasó con el auto-registro
   de 001 la primera vez — no te sorprenda que vuelva a pasar).

## Paso 2 — Plan

Verifica los gates de la Fase -1 contra `memory/constitution.md`
(especialmente Artículo I, III, VII, VIII, IX — los mismos que ya aplicó
`specs/003-motor-de-puntos/plan.md`, que puedes usar de referencia de forma
y de nivel de detalle). Registra en el Registro de complejidad cualquier gate
que falle y su justificación — no lo ignores.

Hipótesis de módulos a **validar, no asumir** (máximo 3, Artículo VII): algo
como `users` (roles, alta, auto-registro, autenticación, invitaciones) y
`profiles` (perfil de alumno, avatar, catálogo de facultades/carreras). Puede
resultar en 1, 2 o 3 módulos reales — eso lo decide el gate de simplicidad
del plan, no esta hipótesis.

Escribe `specs/001-identidad-y-usuarios/plan.md` (alto nivel, decisiones con
su porqué), `data-model.md` (entidades: Usuario, Rol, Perfil de alumno,
Facultad, Carrera, Invitación, Registro de auditoría — con sus campos y
restricciones) y `contracts/` (un archivo por grupo de endpoints, mismo
formato que `specs/003-motor-de-puntos/contracts/*.md`: método+ruta, request/
response, modos de fallo).

Presta atención especial al Artículo V (privilegio mínimo, datos personales)
y a `.claude/skills/seguridad-y-roles/SKILL.md` — este es el módulo que
define autenticación, sesiones y verificación de identidad de todo el
sistema.

## Paso 3 — Tasks

Escribe `specs/001-identidad-y-usuarios/tasks.md` con el mismo formato que
`specs/003-motor-de-puntos/tasks.md`: orden obligatorio
contratos→pruebas→modelo→implementación→integración→pulido, tareas `Txxx`
numeradas, `[P]` donde sea paralelizable, agrupadas por fase. Recuerda: T068
de `003` depende de RF-122 (cuenta pendiente no hace check-in) — al escribir
las tareas de verificación de cuenta, ten presente que `003` ya asume que
existe ese estado.

## Cierre

No hay pruebas de módulo que correr en este prompt (todavía no hay código).
En su lugar, el cierre es documental:

1. Actualiza `docs/progress.md`: fila `001-a` → ✅ hecho; en "Estado por
   feature" marca `001` con Plan ✅ y Tasks ✅; entrada en la Bitácora
   resumiendo qué se decidió y qué ADR (si alguno) se creó.
2. Commit, por ejemplo:
   ```
   docs(identidad): resuelve marcadores de clarify y agrega plan/tasks de 001
   ```
   (referencia los RF resueltos y, si corresponde, el ADR nuevo en el
   cuerpo del commit).

Ver `prompts/README.md` para la convención de commits completa.
