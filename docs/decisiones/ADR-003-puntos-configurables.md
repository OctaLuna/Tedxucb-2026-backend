# ADR-003 — Sin escala fija de puntos

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El diseño asumía una escala predefinida por tipo de actividad. Al consultarlo, la
organización aún no la había pensado y prefiere definir el valor de cada
actividad al crearla.

## Decisión

No hay escala fija. El administrador define el valor en puntos al crear cada
actividad. Cada categoría puede tener un **valor sugerido** que se propone al
crear, editable.

El catálogo de actividades con su valor es consultable por los alumnos antes de
participar.

## Alternativas

**Escala fija en el código.** Rígida y obliga a un despliegue para cambiarla.

**Valor totalmente libre sin sugerencia.** Es lo que se pidió, pero sin
referencia visible dos actividades equivalentes creadas con semanas de diferencia
terminan valiendo distinto. Esa incoherencia es lo primero que un alumno señala
al reclamar, y con razón.

## Consecuencias

- Flexibilidad total para la organización, sin depender de desarrollo.
- El valor sugerido reduce la deriva sin imponer nada.
- **Costo:** la coherencia depende del criterio humano. Conviene revisar
  periódicamente si actividades parecidas valen parecido.
- **Costo:** no se pueden sembrar datos de prueba con una escala realista hasta
  que existan actividades reales.

## Requisitos

RF-301, RF-302, RF-306, RF-310, RF-310a, RF-310b, RF-310c.
