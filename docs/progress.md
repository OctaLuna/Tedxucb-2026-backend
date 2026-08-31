# Progreso de implementación

Este archivo se actualiza **cada vez que se completa un prompt** de
`prompts/` — nunca antes. No reemplaza el estado de fases SDD que ya trackea
[`specs/README.md`](../specs/README.md) (spec/plan/tasks/analyze); lo
complementa con el avance real de implementación, módulo por módulo.

No se edita a mano fuera de ese cierre: cada prompt trae instrucciones
explícitas de qué fila y qué entrada de bitácora le corresponde (ver
[`prompts/README.md`](../prompts/README.md), sección "Cierre estándar").

## Estado por feature

| Feature | Spec | Plan | Tasks | Implementación |
|---|---|---|---|---|
| `001` — Identidad y usuarios | ✅ | ⏳ pendiente | ⏳ pendiente | ⏳ pendiente |
| `002` — Sitio público | ✅ | ⏳ pendiente | ⏳ pendiente | ⏳ pendiente |
| `003` — Motor de puntos | ✅ | ✅ | ✅ | ⏳ pendiente |
| `004` — Selección de cupos | ✅ | ⏳ pendiente | ⏳ pendiente | ⏳ pendiente |

Leyenda: ⏳ pendiente · 🔄 en curso · ✅ hecho · 🚫 bloqueado.

## Módulos

| # | Prompt | Módulo | Estado | Commit | Pruebas |
|---|---|---|---|---|---|
| 00 | `00-bootstrap-infraestructura.md` | Infraestructura base (NestJS, Prisma, Docker) | ⏳ pendiente | — | — |
| 001-a | `001-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Identidad | ⏳ pendiente | — | — |
| 001-b | `001-b-implementacion-identidad.md` | Implementación — Identidad | ⏳ pendiente | — | — |
| 002-a | `002-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Sitio público | ⏳ pendiente | — | — |
| 002-b | `002-b-implementacion-sitio-publico.md` | Implementación — Sitio público | ⏳ pendiente | — | — |
| 003-a | `003-a-modulo-activities.md` | Módulo `activities` (actividades, staff, check-in, QR) | ⏳ pendiente | — | — |
| 003-b | `003-b-modulo-points.md` | Módulo `points` (ledger, ajustes, reversiones, reclamos) | ⏳ pendiente | — | — |
| 003-c | `003-c-modulo-leaderboard.md` | Módulo `leaderboard` (ranking, progreso, export) | ⏳ pendiente | — | — |
| 003-d | `003-d-integracion-y-pulido.md` | Integración cruzada y pulido — Motor de puntos | ⏳ pendiente | — | — |
| 004-a | `004-a-clarify-plan-tasks.md` | Clarify + Plan + Tasks — Selección de cupos | ⏳ pendiente | — | — |
| 004-b | `004-b-implementacion-seleccion-cupos.md` | Implementación — Selección de cupos | ⏳ pendiente | — | — |

## Bitácora

_(más reciente primero — cada entrada la añade el prompt que se acaba de
cerrar: fecha, prompt, qué se hizo, resultado de Jest y de Playwright, hash
del commit)_

Sin entradas todavía.
