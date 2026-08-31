# ADR-001 — Administrador y coordinador son un solo rol

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El diseño inicial separaba dos roles: `ADMIN` para configuración del sistema y
`COORDINADOR` para monitorear alumnos y crear sus perfiles. La separación seguía
el principio de privilegio mínimo.

## Decisión

Se fusionan en un solo rol `ADMIN`, que administra el sistema y monitorea a los
alumnos.

## Alternativas

**Mantener los dos roles.** Descartada por el responsable del proyecto: la
organización del TEDxUCB es un equipo pequeño donde las mismas personas hacen
ambas cosas. Dos roles habrían significado gestionar permisos que nadie usa y
explicar una distinción que no existe en la práctica.

## Consecuencias

- Menos superficie de gestión de permisos y un modelo más fácil de explicar.
- **Costo:** se pierde la capacidad de dar acceso de solo monitoreo a alguien que
  no deba tocar la configuración. Si el equipo crece, habrá que reintroducir la
  distinción.
- El modelo de roles múltiples por usuario permite reintroducirla sin migración
  dolorosa.

## Requisitos

RF-101, RF-103, RF-113 a RF-115.
