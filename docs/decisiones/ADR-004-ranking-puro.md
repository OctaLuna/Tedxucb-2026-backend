# ADR-004 — Ranking puro por puntos, sin cuota por facultad

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El evento aspira a ser interdisciplinario: la línea temática de sostenibilidad se
aborda desde economía, ciencias, arte, gestión e infraestructura. Un ranking
puramente por puntos puede terminar concentrando la mayoría de los cupos en la
carrera más organizada, contradiciendo ese carácter.

## Decisión

Asignación por **ranking puro de puntos, sin cuota por carrera ni facultad**. El
sistema **reporta** la distribución resultante, sin alterar la selección.

El número de cupos es configurable: los valores de 100 y 80 son la estimación
actual, no una constante.

## Alternativas

**Cuota mínima por facultad.** Protege la diversidad disciplinar, pero implica
que un alumno con más puntos quede fuera mientras entra otro con menos. Eso es
difícil de sostener ante quien lo pregunte, cuando la regla comunicada era "los
que más participen".

**Cuota como desempate.** Más sutil, pero también más difícil de explicar. Una
regla de selección que nadie entiende no se percibe como justa.

## Consecuencias

- Regla simple, comunicable en una frase y verificable por cualquier alumno.
- Algoritmo de asignación directo.
- **Costo:** el evento puede quedar concentrado en pocas carreras, en tensión con
  su carácter interdisciplinario.
- **Mitigación:** el reporte de distribución permite a la organización saberlo
  antes del evento y decidir con datos si lo corrige en futuras ediciones.

## Requisitos

RF-401, RF-401a, RF-403, RF-406, RF-407, RF-407a.
