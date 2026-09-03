# Especificaciones — TEDxUCB

Este proyecto sigue **Spec-Driven Development** ([github/spec-kit](https://github.com/github/spec-kit)):
la especificación es la fuente de verdad y el código es su expresión.

```
constitution → specify → clarify → plan → tasks → analyze → implement
```

## Estructura

```
memory/constitution.md          Principios no negociables del proyecto
docs/analisis-sdd.md            Auditoría de consistencia (fase Analyze)
docs/legacy/SPEC-legacy.md      Documento previo a SDD — referencia histórica
specs/
  001-identidad-y-usuarios/
  002-sitio-publico/
  003-motor-de-puntos/
  004-seleccion-de-cupos/
```

## Features

| ID | Feature | Depende de | Estado |
|---|---|---|---|
| `001` | Identidad, usuarios y perfiles | — | spec ✅ · plan ✅ · tasks ✅ |
| `002` | Sitio público TEDxUCB | 001 (parcial) | spec ✅ · plan ✅ · tasks ✅ |
| `003` | Motor de puntos y participación | 001 | spec ✅ · plan ✅ · tasks ✅ |
| `004` | Selección y gestión de cupos | 003 | spec ✅ · plan ✅ · tasks ✅ |

Las cuatro features tienen ya el ciclo técnico completo (`plan.md` +
`data-model.md` + `contracts/` + `tasks.md`). `003` y `004` son las de mayor
riesgo: entre las dos deciden, en última instancia, quién ocupa los 80
asientos.

## Orden de trabajo recomendado

`002` no depende del motor de puntos y puede publicarse mucho antes. Conviene
sacarlo temprano: da presencia al evento y empieza a recibir postulaciones de
speakers mientras el resto se construye.

```
001 (base) ──> 002 (sitio público, publicable ya)
           └─> 003 (motor de puntos) ──> 004 (cupos)
```

## Estado de las fases

| Fase | Estado |
|---|---|
| Constitution | ✅ `memory/constitution.md` |
| Specify | ✅ 4 specs redactados |
| Clarify | ✅ completa — **0 marcadores abiertos** (001: 0 · 002: 0 · 003: 0 · 004: 0) |
| Plan | ✅ `001`, `002`, `003` y `004` |
| Tasks | ✅ `001`, `002`, `003` y `004` |
| Analyze | ✅ `docs/analisis-sdd.md` |
| Implement | 🟡 `001`, `002` y `003` implementados y probados (`docs/progress.md`); `004` pendiente (`004-b`) |

## Decisiones tomadas

| Fecha | Requisito | Decisión |
|---|---|---|
| 2026-08-30 | Roles | Administrador y coordinador son un solo rol |
| 2026-08-30 | RF-310 | Sin escala fija de puntos: el administrador define el valor al crear cada actividad, con valor sugerido por categoría |
| 2026-08-30 | RF-407 | Ranking puro por puntos, sin cuota por facultad. El sistema reporta la distribución resultante |
| 2026-08-30 | RF-401 | El número de cupos es configurable; 100/80 es estimación, no constante |
| 2026-08-30 | RF-109 | Auto-registro de alumnos con credenciales propias, no autenticación federada |
| 2026-08-31 | Corrección de correo | Solo el administrador puede cambiar el correo de un alumno ya activo, a solicitud del alumno, con re-verificación |
| 2026-08-31 | RF-108 | 7 días de vigencia para invitaciones, verificación y recuperación |
| 2026-08-31 | RF-123 | Dominio institucional `@ucb.edu.bo` — todos los alumnos activos tienen correo de ese dominio |
| 2026-08-31 | RF-105 / RF-125 | No existe padrón institucional exportable: se elimina RF-105, RF-125 se redacta sin validación automática contra padrón (ver ADR-007) |
| 2026-08-31 | RF-110 | No habrá servicio de alimentos: se elimina el campo "restricciones alimentarias" |
| 2026-08-31 | RF-128 | No existe texto de consentimiento aprobado: el sistema soporta un texto configurable y versionado por el administrador |
| 2026-08-31 | RF-121 | Retención indefinida de datos personales — no hay eliminación/anonimización automática |
| 2026-09-01 | RF-213 | Correo de confirmación de postulación: acuse de recibo simple, sin fechas ni plazos comprometidos |
| 2026-09-01 | RF-217 | Sin exigencia formal de conformidad WCAG; única huella de backend es el texto alternativo de la foto de speaker |
| 2026-09-01 | RF-219 | Cumplimiento de marca TEDx descartado del backend — responsabilidad 100% de frontend/diseño (ver ADR-006) |
| 2026-09-01 | RF-220 | Sede y datos generales cubiertos por la entidad Evento; agenda/programa, si se publica, es contenido estático del frontend |
| 2026-09-01 | CE-201 | Meta de postulaciones y fecha de cierre quedan como deuda técnica explícita — primera edición, sin dato histórico para fijarla |
| 2026-09-02 | RF-342 | Ranking completo visible para todos los alumnos autenticados, no solo la posición propia |
| 2026-09-02 | RF-322 | Sin umbral fijo de anomalía por dispositivo; detección automática (T090) queda como deuda técnica explícita, no bloqueante |
| 2026-09-02 | RF-323 | No existen actividades masivas confirmadas; no se construye un modo de registro alternativo |
| 2026-09-02 | Caso límite "cupo lleno" | Las actividades no tienen límite de asistentes; se elimina el campo `capacity` del modelo y `422 ACTIVITY_FULL` del contrato de check-in |
| 2026-09-02 | Vigencia del token QR | 60 segundos, confirmado |
| 2026-09-02 | RF-334 a RF-337 (Historia 5) | Se elimina el canal formal de reclamos y el concepto de fecha de corte del ranking; el ranking es una vista continua sin evento de cierre (ver ADR-008) |
| 2026-09-03 | RF-411 a RF-415 (Historia 2 y 3) | Se elimina la confirmación del alumno, la lista de espera y la promoción automática: estar seleccionado y recibir el aviso ya deja el lugar en firme; un lugar liberado solo se llena si el administrador decide hacerlo a mano (ver ADR-009) |
| 2026-09-03 | RF-420 | Los ~20 lugares no estudiantiles son íntegramente de asignación manual del administrador |
| 2026-09-03 | RF-423 | El sistema no notifica a los alumnos que no fueron seleccionados |

La decisión de auto-registro **abrió más preguntas de las que cerró**: al dejar
de controlar la organización quién entra al sistema, aparecieron seis requisitos
nuevos de verificación de identidad (RF-122 a RF-128). Es el comportamiento
esperado de la fase Clarify y por eso el conteo de marcadores no bajó de
inmediato. La ronda de clarificación del 2026-08-31 resolvió los 7 marcadores
reales que quedaban abiertos en `001` (spec ✅ plan ✅ tasks ✅) — de paso
confirmó que el "padrón institucional" no existe, lo que llevó a
[ADR-007](../docs/decisiones/README.md).

La ronda de clarificación del 2026-09-01 resolvió los 5 marcadores reales de
`002` (spec ✅ plan ✅ tasks ✅) — el conteo previo de esta tabla decía 6, pero
el propio checklist de `spec.md` ya marcaba "5 abiertos"; mismo tipo de
desfase ya visto y corregido en `001`.

La ronda de clarificación del 2026-09-02 resolvió los 9 marcadores reales de
`003` (spec ✅ plan ✅ tasks ✅) — el conteo previo de esta tabla decía 10 y el
checklist de `spec.md` decía 6; ninguno de los dos era correcto (mismo tipo de
desfase ya visto en `001` y `002`). Una sola tarea del Grupo 0 podía cerrar
varios marcadores a la vez porque la misma pregunta aparecía repetida en
`spec.md` y en `contracts/`. La decisión sobre reclamos fue la de mayor peso:
elimina una entidad completa (`PointClaim`) y el concepto de fecha de corte
del ranking — ver [ADR-008](../docs/decisiones/README.md).

La ronda de clarificación del 2026-09-03 resolvió los 9 marcadores reales de
`004` (spec ✅ plan ✅ tasks ✅) — la de mayor cambio de alcance de las cuatro
rondas hechas hasta ahora. Al preguntar los marcadores tal como estaban
redactados en el diseño original (invitación con plazo de confirmación,
lista de espera ordenada, promoción automática al liberarse un lugar), la
respuesta del responsable del proyecto fue rechazar ese mecanismo por
completo: el aforo limitado seguía siendo real, pero el diseño alrededor de
la selección era mucho más elaborado de lo que tenía en mente. Una segunda
ronda de preguntas, evitando la terminología que había generado la
confusión inicial, confirmó el modelo real: el administrador ejecuta la
selección cuando decide, los mejores posicionados del ranking quedan
anotados de inmediato sin un paso de confirmación, y un lugar liberado
después solo se llena si el administrador decide hacerlo a mano — ver
[ADR-009](../docs/decisiones/README.md), de peso comparable a ADR-008:
elimina dos historias de usuario completas y siete requisitos funcionales.

## Reglas del repositorio

1. **La spec manda.** Si el código y la spec discrepan, la spec tiene razón
   hasta que se enmiende explícitamente.
2. **Los specs no llevan tecnología.** Stack, esquemas y endpoints van en
   `plan.md`, `data-model.md` y `contracts/`.
3. **No se adivina.** Lo que no está decidido se marca
   `[NECESITA CLARIFICACIÓN]`, no se rellena con un valor razonable.
4. **Test-first, sin excepciones** en check-in y asignación de cupos
   (Artículo III).
5. **Un cambio de requisito vuelve al spec** antes de tocar el código.
