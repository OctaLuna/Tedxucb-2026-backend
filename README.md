# TEDxUCB

Plataforma web para el **TEDxUCB**, Universidad Católica Boliviana "San Pablo",
Sede La Paz. **9 de noviembre.**

Dos productos sobre una misma base:

- **Sitio público** — temática, speakers, cuenta atrás y postulación de speakers.
- **Plataforma interna de puntos** — los alumnos acumulan puntos participando en
  actividades previas, y esos puntos deciden quién ocupa las butacas del
  auditorio.

Este repositorio contiene **únicamente el backend/API**. El frontend vive
fuera de este repositorio y consume esta API — ver
[`docs/decisiones/ADR-006-repositorio-solo-backend.md`](docs/decisiones/ADR-006-repositorio-solo-backend.md).

## Empieza por aquí

| Si eres… | Lee |
|---|---|
| Nuevo en el proyecto | [`docs/onboarding.md`](docs/onboarding.md) |
| Un agente de código | [`CLAUDE.md`](CLAUDE.md) |
| De la organización del evento | los `spec.md` de [`specs/`](specs/) |
| Quien va a implementar | [`specs/003-motor-de-puntos/tasks.md`](specs/003-motor-de-puntos/tasks.md) |

## Estructura

```
CLAUDE.md              Contexto permanente para agentes de código
memory/
  constitution.md      Los nueve artículos. No se toca sin enmienda.
specs/                 Las cuatro features (SDD)
  001-identidad-y-usuarios/
  002-sitio-publico/
  003-motor-de-puntos/     ← ciclo técnico completo
  004-seleccion-de-cupos/
.claude/skills/        Skills propias del proyecto
docs/
  arquitectura.md      glosario.md       onboarding.md       progress.md
  operacion-dia-del-evento.md            analisis-sdd.md
  decisiones/          ADR
  legacy/              Documento previo a SDD
prompts/               Prompts de implementación en orden — ver prompts/README.md
prisma/ src/ tests/    Código del backend (aún no iniciado) — directo en la raíz
```

## Metodología

[Spec-Driven Development](https://github.com/github/spec-kit): **la
especificación manda, el código obedece.**

```
constitution → specify → clarify → plan → tasks → analyze → implement
```

## Estado

**Fase Clarify, ronda 1 completada.** Quedan 34 marcadores
`[NECESITA CLARIFICACIÓN]` abiertos. La implementación puede arrancar por `001` y
`002`.

Decisiones tomadas en [`docs/decisiones/`](docs/decisiones/).

## Stack

NestJS + TypeScript + PostgreSQL + Prisma. Monolito modular. BullMQ + Redis.
Justificación en [`specs/003-motor-de-puntos/plan.md`](specs/003-motor-de-puntos/plan.md).
