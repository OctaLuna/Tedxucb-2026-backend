# ADR-002 — Libro mayor de puntos de solo inserción

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

Los puntos deciden quién ocupa las butacas del evento. Un alumno que quede fuera
por poco margen va a preguntar por qué, y la organización tiene que poder
responder con evidencia, no con memoria.

El diseño obvio —un campo `puntos` que se suma y se resta— no puede explicar cómo
llegó a su valor actual.

## Decisión

El puntaje de un alumno es **siempre** la suma de sus movimientos en
`point_transactions`. La tabla es de solo inserción: prohibidos `UPDATE` y
`DELETE`, con trigger y privilegios revocados. Las correcciones son movimientos
`REVERSAL` que apuntan al original. `total_points` es caché derivada y
reconstruible.

## Alternativas

**Campo mutable de puntaje.** Más simple, pero no puede justificar su valor ante
un reclamo.

**Tabla de historial paralela, informativa.** Se desincroniza en cuanto alguien
escribe directo sobre el puntaje, y el descubrimiento llega tarde.

**Borrado lógico de movimientos erróneos.** Destruye la evidencia justo cuando
más se necesita, que es durante un reclamo.

## Consecuencias

- Cada punto es explicable: el alumno ve de dónde salió sin pedir ayuda.
- Los errores se corrigen sin destruir el historial.
- El puntaje puede recalcularse desde cero.
- **Costo:** más escritura por operación, una caché que mantener sincronizada y
  un proceso de reconciliación que construir y vigilar.
- **Costo:** el historial es más largo y hay que presentarlo con cuidado para que
  una reversión no confunda al alumno.

## Requisitos

RF-324 a RF-333. Artículo IV de la constitución.
