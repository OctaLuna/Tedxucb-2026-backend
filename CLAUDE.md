# CLAUDE.md — TEDxUCB

Contexto permanente del proyecto. Léelo antes de tocar nada.

## Qué es esto

Plataforma para el **TEDxUCB**, evento de la Universidad Católica Boliviana "San
Pablo", Sede La Paz, el **9 de noviembre**. Dos productos sobre una misma base:

1. **Sitio público** — temática, speakers, cuenta atrás, postulación de speakers.
2. **Plataforma interna de puntos** — los alumnos acumulan puntos participando en
   actividades previas, y esos puntos deciden quién ocupa las butacas del
   auditorio.

Este repositorio (`Ted_backend`) contiene **únicamente el backend/API** que
sirve a los dos productos. El frontend (sitio público, panel de alumno/staff)
vive fuera de este repositorio y lo consume como cliente HTTP — ver
`docs/decisiones/ADR-006-repositorio-solo-backend.md`.

## Lo único que hay que entender antes de escribir código

El aforo es limitado y la demanda lo supera. **Los puntos deciden quién entra al
evento y quién se queda afuera.** Cada punto mal otorgado, duplicado o perdido es
una decisión injusta con nombre y apellido.

De ahí sale todo lo demás: por qué el libro mayor es de solo inserción, por qué
las correcciones son reversiones y no ediciones, por qué el check-in es
idempotente, por qué existe un canal de reclamos. Si en algún momento una
decisión técnica parece exagerada, vuelve a este párrafo.

## Metodología: Spec-Driven Development

Este proyecto sigue SDD ([github/spec-kit](https://github.com/github/spec-kit)):
**la especificación manda, el código obedece.**

```
constitution → specify → clarify → plan → tasks → analyze → implement
```

Reglas que no se negocian:

1. **La spec es la fuente de verdad.** Si el código y la spec discrepan, la spec
   tiene razón hasta que se enmiende explícitamente.
2. **No adivines.** Lo que no está decidido se marca `[NECESITA CLARIFICACIÓN]`
   en la spec, no se rellena con un valor razonable. Un requisito inventado
   produce código que hay que tirar.
3. **Test-first** (Artículo III). Sin excepción en el check-in y en la asignación
   de cupos.
4. **Un cambio de requisito vuelve a la spec** antes de tocar el código.
5. **Los specs no llevan tecnología.** Stack, esquemas y endpoints van en
   `plan.md`, `data-model.md` y `contracts/`.

## Estructura

```
CLAUDE.md              Este archivo
memory/constitution.md Principios no negociables — léelo antes del primer commit
specs/                 Las cuatro features, con sus planes y contratos
.claude/skills/        Skills propias del proyecto (ver abajo)
docs/                  Arquitectura, glosario, decisiones, operación, progress.md
prompts/               Prompts de implementación en orden — ver prompts/README.md
prisma/ src/ tests/    Código del backend (aún no iniciado) — directo en la raíz
```

## Skills del proyecto

En `.claude/skills/`. Cárgalas según lo que estés haciendo:

| Skill | Cuándo |
|---|---|
| `spec-workflow` | Crear o modificar specs, añadir features, resolver marcadores |
| `motor-de-puntos` | **Cualquier** cosa que toque puntos, check-in, ledger o ranking |
| `modulo-backend` | Crear o modificar módulos NestJS y migraciones Prisma |
| `contratos-api` | Definir o cambiar endpoints |
| `pruebas` | Escribir pruebas de cualquier tipo |
| `seguridad-y-roles` | Autenticación, permisos, datos personales, auditoría |

`motor-de-puntos` es la más importante. Si el cambio roza los puntos aunque sea
de lejos, cárgala.

## Features

| ID | Feature | Depende de | Estado |
|---|---|---|---|
| `001` | Identidad, usuarios y perfiles | — | spec ✅ |
| `002` | Sitio público | 001 parcial | spec ✅ |
| `003` | Motor de puntos | 001 | spec ✅ plan ✅ tasks ✅ |
| `004` | Selección de cupos | 003 | spec ✅ |

`002` no depende del motor de puntos y conviene publicarlo temprano: da presencia
al evento y empieza a recibir postulaciones mientras el resto se construye.

## Roles

`ADMIN` (administra y monitorea, es un solo rol), `STAFF` (valida participación
solo donde está asignado), `ALUMNO` (participa y consulta su progreso). Un
usuario puede tener varios roles a la vez.

## Stack

NestJS + TypeScript + PostgreSQL + Prisma. Monolito modular. BullMQ + Redis para
trabajos en segundo plano. Detalle y justificación en
`specs/003-motor-de-puntos/plan.md`.

## Estado actual

**Fase Clarify, ronda 1 completada.** Quedan 34 marcadores
`[NECESITA CLARIFICACIÓN]` abiertos. La implementación puede arrancar por `001`
y `002`; `003` tiene sus tareas desglosadas en
`specs/003-motor-de-puntos/tasks.md`.

Decisiones ya tomadas: ver `docs/decisiones/`.

## Convenciones

- **Idioma:** documentación, specs y mensajes de commit en español. Código,
  nombres de variables y de tablas en inglés.
- **Fechas:** UTC en base de datos, `America/La_Paz` al presentar.
- **Commits:** referencia el requisito o la tarea (`RF-314`, `T060`).
- **Nunca** subas secretos al repositorio. Todo por variables de entorno.

## Errores que ya cometimos, para no repetirlos

- **Mezclar QUÉ y CÓMO en la spec.** El primer documento del proyecto tenía DDL y
  endpoints dentro de los requisitos; las decisiones de producto quedaron
  enterradas y varias se dieron por resueltas sin haberse decidido nunca. Está en
  `docs/legacy/` como recordatorio.
- **Declarar 14 módulos de entrada.** Violaba el Artículo VII. Se redujo a 3 por
  feature.
- **Olvidar el canal de reclamos.** Con cupos disputados, los reclamos llegan
  igual; sin canal formal se resuelven por WhatsApp y de forma desigual.
