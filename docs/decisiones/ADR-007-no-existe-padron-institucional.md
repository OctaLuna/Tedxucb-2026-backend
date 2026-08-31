# ADR-007 — No existe padrón institucional: la revisión manual reemplaza la validación automática

**Fecha:** 2026-08-30 · **Estado:** aceptada

## Contexto

El diseño inicial de `001` (RF-105, RF-125) prescribía que el administrador
pudiera importar un padrón institucional de alumnos habilitados, y que el
sistema validara el código de registro declarado contra ese padrón cuando
estuviera cargado. `ADR-005` (auto-registro) ya dejó esto como condicional:
"el padrón puede no existir [...] si no hay padrón, esta puerta queda
abierta". El responsable del proyecto confirmó que no se trata de que el
padrón "todavía no está cargado": la universidad no provee un archivo
exportable de alumnos habilitados. La condición nunca se va a cumplir para
esta edición del evento.

## Decisión

Se elimina **RF-105** por completo: no se construye funcionalidad de
importación de padrón, ni tabla que lo represente, ni pantalla de gestión de
filas inválidas. **RF-125** se redacta de nuevo: el sistema NO tiene
validación automática contra un padrón externo. Las barreras contra fraude/
duplicados de esta feature quedan en cuatro capas, ninguna suficiente por sí
sola:

1. Dominio de correo institucional (RF-123).
2. Verificación de titularidad del correo (RF-124).
3. Unicidad permanente de código de registro y correo, sin liberarse aunque
   una cuenta se rechace o deshabilite (RF-106).
4. Revisión manual del administrador sobre registros sospechosos (RF-126).

## Alternativas

**Mantener RF-105/RF-125 como funcionalidad condicional, deshabilitada hasta
que exista un padrón.** Descartada: construir una tabla y un importador para
un archivo que la universidad confirmó que no proveerá es el future-proofing
que prohíbe el Artículo VII. Si algún día aparece un padrón, esta decisión
se reabre con un spec nuevo — no se mantiene código muerto esperándolo.

**Pedir a la universidad un padrón ad-hoc para este proyecto.** Descartada
por el responsable del proyecto: depende de un tercero (registro académico)
sin compromiso de plazo, y el evento es el 9 de noviembre.

**Convertir el documento de identidad en un campo obligatorio con validación
en el registro**, en vez de opcional post-registro. Evaluada y descartada
para esta feature: es una funcionalidad mucho mayor (¿validación manual?
¿OCR automático?), no especificada ni priorizada, y la verificación de
documento en persona ya está prevista el día del evento, fuera del alcance de
`001`.

## Consecuencias

- El único filtro automático real contra alguien ajeno a la UCB sigue siendo
  el dominio del correo (RF-123), que se puede eludir con un correo
  institucional prestado. Ese caso límite queda reconocido y sin resolver del
  todo por diseño: su mitigación real es la verificación en la puerta el día
  del evento, fuera de esta feature.
- La revisión manual (RF-126) deja de ser una pantalla secundaria y pasa a
  ser, junto con el dominio y la verificación de correo, una de las tres
  barreras reales del sistema. Tiene una consecuencia operativa directa: el
  panel de registros pendientes/sospechosos debe tratarse como
  infraestructura antifraude de primera línea en la implementación, no como
  un "nice to have" al final del Grupo 6 de `tasks.md`.
- Simplifica el modelo de datos de `001`: no hay tabla de padrón, no hay job
  de importación masiva, no hay UI de carga de CSV con reporte de filas
  inválidas. Menos superficie que construir y mantener antes del evento.
- Si en una edición futura la universidad sí provee un padrón, esta decisión
  se revisa con un ADR y un RF nuevos, no reabriendo este.
- **CE-106** ("cero cuentas duplicadas detectadas al cierre del ranking")
  pasa a depender más del criterio humano del administrador que de una
  validación determinística. Es una medida más difícil de garantizar, y
  conviene que el responsable del proyecto lo sepa explícitamente antes de
  comprometerse con esa cifra.

## Requisitos

RF-105 (eliminado), RF-106, RF-123, RF-124, RF-125 (redactado), RF-126.
