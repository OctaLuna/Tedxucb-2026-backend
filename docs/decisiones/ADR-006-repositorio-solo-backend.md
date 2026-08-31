# ADR-006 — Este repositorio es exclusivamente el backend

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El proyecto se especificó con SDD pensando en TEDxUCB como producto completo:
"dos productos sobre una misma base" (sitio público + plataforma de puntos).
Ese lenguaje, y una carpeta `backend/` anidada dentro del propio repositorio
`Ted_backend`, dejaban ambiguo si este repositorio debía contener también el
frontend, o solo una parte de él anidada bajo `backend/`.

Ningún spec depende de tecnología de frontend — los requisitos de 001-004 ya
están redactados como comportamiento del sistema, sin mencionar UI ni
framework — pero la documentación estructural (CLAUDE.md, README.md) no
declaraba el límite del repositorio.

## Decisión

`Ted_backend` contiene **únicamente el backend/API** (NestJS + Prisma +
PostgreSQL + Redis/BullMQ) que sirve a ambos productos. El código, cuando
exista, vive directo en la raíz del repositorio (`prisma/`, `src/`, `tests/`),
sin una carpeta `backend/` anidada. El frontend (sitio público, panel de
alumno/staff) es un consumidor externo de esta API y vive fuera de este
repositorio.

## Alternativas

**Un monorepo con frontend y backend en el mismo repositorio.** Descartada:
el nombre del repositorio, su alcance de trabajo actual y la ausencia de
cualquier código o configuración de frontend indican que la intención ya era
separar ambos. Mantener la ambigüedad solo retrasaría el problema.

**Mantener `backend/` como carpeta anidada**, por si en el futuro se agrega
frontend al mismo repo. Descartada por el Artículo VIII (anti-abstracción):
anidar una carpeta "por si acaso" para un frontend que no está planeado ni
especificado es sobre-ingeniería sin requisito que la respalde.

## Consecuencias

- La estructura del repositorio queda directa: no hay que navegar un nivel
  extra (`backend/src/...`) para llegar al código.
- Los documentos (`CLAUDE.md`, `README.md`, `docs/arquitectura.md`,
  `docs/onboarding.md`) declaran explícitamente el límite del repositorio, en
  vez de dejarlo implícito.
- **Costo:** si en algún momento se decide unificar frontend y backend en un
  monorepo, habrá que mover el código actual bajo una subcarpeta (`apps/api/`
  o similar) y actualizar todas las rutas documentadas. No hay indicio hoy de
  que eso vaya a pasar.

## Requisitos

Ninguno directamente — es una decisión estructural del repositorio, no de
producto. Afecta la organización de todos los specs (`001`-`004`) por igual.
