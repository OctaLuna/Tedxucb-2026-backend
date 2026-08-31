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
| `001` | Identidad, usuarios y perfiles | — | spec ✅ · plan ⏳ · tasks ⏳ |
| `002` | Sitio público TEDxUCB | 001 (parcial) | spec ✅ · plan ⏳ · tasks ⏳ |
| `003` | Motor de puntos y participación | 001 | spec ✅ · plan ✅ · tasks ✅ |
| `004` | Selección y gestión de cupos | 003 | spec ✅ · plan ⏳ · tasks ⏳ |

`003` tiene el ciclo técnico completo porque es la feature de mayor riesgo: es
la que decide, en última instancia, quién ocupa los 80 asientos.

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
| Clarify | 🟡 Ronda 1 completada — **34 marcadores abiertos** (001: 8 · 002: 6 · 003: 10 · 004: 10) |
| Plan | 🟡 Solo `003` |
| Tasks | 🟡 Solo `003` |
| Analyze | ✅ `docs/analisis-sdd.md` |
| Implement | ⛔ Bloqueada |

## Decisiones tomadas

| Fecha | Requisito | Decisión |
|---|---|---|
| 2026-08-30 | Roles | Administrador y coordinador son un solo rol |
| 2026-08-30 | RF-310 | Sin escala fija de puntos: el administrador define el valor al crear cada actividad, con valor sugerido por categoría |
| 2026-08-30 | RF-407 | Ranking puro por puntos, sin cuota por facultad. El sistema reporta la distribución resultante |
| 2026-08-30 | RF-401 | El número de cupos es configurable; 100/80 es estimación, no constante |
| 2026-08-30 | RF-109 | Auto-registro de alumnos con credenciales propias, no autenticación federada |

La decisión de auto-registro **abrió más preguntas de las que cerró**: al dejar
de controlar la organización quién entra al sistema, aparecieron seis requisitos
nuevos de verificación de identidad (RF-122 a RF-128). Es el comportamiento
esperado de la fase Clarify y por eso el conteo de marcadores no bajó.

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
