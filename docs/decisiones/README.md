# Decisiones de arquitectura (ADR)

Una decisión estructural por archivo. Registran **por qué** se decidió algo, no
solo qué se decidió: dentro de tres meses nadie recordará qué alternativas se
descartaron.

| ADR | Decisión | Fecha |
|---|---|---|
| [001](ADR-001-fusion-admin-coordinador.md) | Administrador y coordinador son un solo rol | 2026-08-30 |
| [002](ADR-002-ledger-append-only.md) | Libro mayor de puntos de solo inserción | 2026-08-30 |
| [003](ADR-003-puntos-configurables.md) | Sin escala fija de puntos: valor por actividad | 2026-08-30 |
| [004](ADR-004-ranking-puro.md) | Ranking puro por puntos, sin cuota por facultad | 2026-08-30 |
| [005](ADR-005-auto-registro.md) | Auto-registro de alumnos con verificación | 2026-08-30 |
| [006](ADR-006-repositorio-solo-backend.md) | Este repositorio es exclusivamente el backend | 2026-08-30 |
| [007](ADR-007-no-existe-padron-institucional.md) | No existe padrón institucional: la revisión manual reemplaza la validación automática | 2026-08-30 |
| [008](ADR-008-sin-reclamos-ni-corte-formal.md) | Sin canal de reclamos ni fecha de corte del ranking | 2026-09-02 |

## Formato

```markdown
# ADR-NNN — Título
**Fecha** · **Estado** (propuesta / aceptada / reemplazada por ADR-XXX)
## Contexto      Qué problema había
## Decisión      Qué se decidió
## Alternativas  Qué se descartó y por qué
## Consecuencias Qué gana y qué cuesta, incluido lo malo
## Requisitos    RF afectados
```

La sección de consecuencias incluye las negativas. Un ADR que solo lista
ventajas no está registrando una decisión: está justificándola.
