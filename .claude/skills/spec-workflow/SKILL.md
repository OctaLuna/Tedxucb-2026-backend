---
name: spec-workflow
description: Flujo Spec-Driven Development del repositorio TEDxUCB — dónde vive cada artefacto, cómo añadir una feature, cómo redactar requisitos verificables, cómo resolver marcadores [NECESITA CLARIFICACIÓN] y cómo auditar consistencia. Úsala siempre que vayas a crear o modificar un spec, plan, contrato o lista de tareas; cuando el usuario pida una funcionalidad nueva; cuando descubras que el código y la spec discrepan; o cuando alguien pregunte "¿dónde documento esto?". También al empezar cualquier sesión de trabajo sobre este repositorio, para no escribir código sin spec detrás.
---

# Flujo SDD — TEDxUCB

Este proyecto sigue [github/spec-kit](https://github.com/github/spec-kit): **la
especificación manda, el código obedece**. Se escribe primero QUÉ y POR QUÉ,
luego CÓMO, luego las tareas, y solo entonces el código.

```
constitution → specify → clarify → plan → tasks → analyze → implement
```

## Dónde vive cada cosa

```
memory/constitution.md         Principios no negociables. No se toca sin enmienda.
specs/README.md                Mapa de features y decisiones tomadas
specs/NNN-nombre/
  spec.md                      QUÉ y POR QUÉ. Sin tecnología.
  plan.md                      CÓMO. Gates, decisiones técnicas y su porqué.
  data-model.md                Esquema detallado
  contracts/                   Contratos de API, escritos ANTES del código
  quickstart.md                Escenarios de validación manual
  tasks.md                     Tareas ejecutables, orden test-first
docs/decisiones/               ADR: una decisión, un archivo
docs/analisis-sdd.md           Última auditoría de consistencia
```

## La regla que más se incumple

**En `spec.md` no va tecnología.** Ni DDL, ni endpoints, ni nombres de
framework, ni estructura de carpetas. Eso va en `plan.md`, `data-model.md` y
`contracts/`.

El primer documento de este proyecto mezclaba ambas cosas, y el resultado fue que
las decisiones de producto quedaron enterradas entre decisiones técnicas: varias
se dieron por resueltas sin haberse decidido nunca. Está en `docs/legacy/` como
recordatorio.

Prueba rápida: si una persona del equipo organizador del evento no entiende una
línea de la spec, esa línea está en el archivo equivocado.

## No adivines

La regla más importante de la fase Specify. Lo que el usuario no especificó se
marca:

```markdown
`[NECESITA CLARIFICACIÓN: pregunta concreta y por qué importa]`
```

No rellenes con un valor razonable. Un requisito inventado produce código que hay
que tirar y, peor, produce la ilusión de que la decisión ya se tomó.

Marca el requisito **concreto** que queda bloqueado, no una lista de dudas al
final del documento. El marcador tiene que estar donde alguien lo va a chocar.

## Añadir una feature

1. Numera consecutivo escaneando `specs/` (`005-`, `006-`…).
2. Crea `specs/NNN-nombre-corto/spec.md`.
3. Escribe contexto, alcance (qué sí y qué no), historias con prioridad, casos
   límite, requisitos, entidades y criterios de éxito.
4. Revisa la checklist de completitud tú mismo antes de mostrarla.
5. Actualiza `specs/README.md` con la feature y sus dependencias.

## Redactar requisitos

Verificables, en forma de afirmación:

- ✅ `RF-314: El sistema DEBE registrar la participación y otorgar los puntos en una única operación indivisible.`
- ❌ `El sistema debe ser robusto y confiable.`

Numeración por feature: `001` → RF-1xx, `002` → RF-2xx, `003` → RF-3xx,
`004` → RF-4xx. Si un requisito se subdivide después, usa sufijos (`RF-310a`)
para no renumerar y romper las referencias de commits y código.

## Historias de usuario

Cada una **probable de forma independiente**. Si para probar la Historia 3 hace
falta que funcionen la 1 y la 2, están mal cortadas.

```markdown
### Historia N — [título] (Prioridad: P1/P2/P3)
Como [rol], quiero [acción] para [beneficio].

**Por qué esta prioridad:** [justificación real, no "es importante"]
**Prueba independiente:** [cómo se prueba sola]

**Escenarios de aceptación:**
1. **Dado** [contexto], **Cuando** [acción], **Entonces** [resultado]
```

Los escenarios negativos importan tanto como los felices. En este proyecto, más:
el doble escaneo y el token vencido son los que sostienen la legitimidad del
ranking.

## Criterios de éxito

Medibles y **no técnicos**. Miden el producto, no la implementación.

- ✅ `CE-304: Menos del 5% de los registros se realiza por vía manual.`
- ❌ `CE-xxx: La cobertura de pruebas supera el 80%.`

## Fase Clarify

Repasa los specs buscando ambigüedades y resuelve primero las de mayor impacto:
las que bloquean más trabajo aguas abajo.

Máximo cinco preguntas por ronda; más abruma y baja la calidad de las
respuestas. Cuando llegue la respuesta:

1. Reemplaza el marcador por el requisito ya decidido.
2. Anota la fecha de la decisión en el propio requisito.
3. Registra la decisión en `specs/README.md` y, si es estructural, crea un ADR
   en `docs/decisiones/`.
4. Actualiza el conteo en la checklist del spec.
5. **Revisa si la respuesta abrió requisitos nuevos.** Suele pasar: en este
   proyecto la decisión de auto-registro cerró un marcador y abrió seis, porque
   cambió quién controla la entrada al sistema.

## Fase Plan

`plan.md` de alto nivel; el detalle en archivos aparte.

Verifica los gates de la Fase -1 contra `memory/constitution.md`. **Si un gate
falla, no lo ignores: documenta la justificación en el Registro de complejidad.**
Ese registro existe para crear responsabilidad explícita sobre cada decisión que
añade complejidad, no para pedir perdón por ella.

En la tabla de decisiones técnicas escribe el **porqué**, no solo el qué. Dentro
de tres meses nadie recordará qué alternativas se descartaron ni por qué.

## Fase Tasks

Orden obligatorio: contratos → pruebas → modelo → implementación → integración →
pulido.

Marca `[P]` lo paralelizable (no comparte archivos ni depende de otra tarea del
grupo). Cada tarea debe poder ejecutarse sin reabrir la spec. Si una tarea exige
una decisión que el plan no tomó, vuelve a Plan en lugar de improvisar.

## Fase Analyze

Auditoría cruzada. Reporta en tabla corta, no en prosa:

- ¿Todo requisito tiene al menos una tarea que lo cubre?
- ¿Alguna tarea no traza a ningún requisito? Posible feature especulativa.
- ¿El plan respeta la constitución?
- ¿Quedan marcadores sin resolver?

## Cuando el código y la spec discrepan

La spec tiene razón hasta que se enmiende explícitamente. Dos caminos válidos:

1. El código está mal → corrígelo.
2. La spec está mal → **enmiéndala primero**, con fecha y motivo, y luego corrige
   el código.

Lo que no es válido es dejar que diverjan en silencio. SDD vive de que no lo
hagan.
