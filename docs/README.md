# Documentación — TEDxUCB

| Documento | Qué contiene |
|---|---|
| [`arquitectura.md`](arquitectura.md) | Visión técnica del sistema y sus piezas |
| [`glosario.md`](glosario.md) | Términos del dominio, con el significado que tienen aquí |
| [`onboarding.md`](onboarding.md) | Cómo incorporarse al proyecto |
| [`operacion-dia-del-evento.md`](operacion-dia-del-evento.md) | Guía operativa para el 9 de noviembre |
| [`analisis-sdd.md`](analisis-sdd.md) | Auditoría de consistencia del proyecto |
| [`decisiones/`](decisiones/) | ADR: una decisión estructural por archivo |
| [`legacy/`](legacy/) | Documento previo a SDD, conservado como referencia |

## Qué va dónde

- **Requisitos** → `specs/`, nunca aquí.
- **Decisiones técnicas de una feature** → el `plan.md` de esa feature.
- **Decisiones estructurales del proyecto** → un ADR en `decisiones/`.
- **Cómo operar el sistema** → aquí.

Si dudas entre `docs/` y `specs/`: los specs describen qué debe hacer el
sistema; `docs/` describe cómo está construido y cómo se opera.
