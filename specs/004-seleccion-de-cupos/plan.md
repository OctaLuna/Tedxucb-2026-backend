# Plan de implementación: Selección de asistentes y control de acceso

**Basado en:** `specs/004-seleccion-de-cupos/spec.md`
**Stack:** NestJS + TypeScript + PostgreSQL + Prisma, monolito modular — mismo
stack ya usado en `001`/`002`/`003`.

> Este documento se mantiene de alto nivel. El esquema detallado está en
> `data-model.md`, los contratos de API en `contracts/`, y los escenarios de
> validación manual en `quickstart.md`.

## Resumen técnico

Feature deliberadamente pequeña tras ADR-009 (2026-09-03): sin máquina de
estados de invitación, sin lista de espera, sin plazos de confirmación. Una
persona está **seleccionada** o no lo está; una **entrada** está usada o no.

La operación central es la ejecución de la selección: el administrador la
dispara en el momento que decide, el sistema toma a los mejores posicionados
del ranking de `003` hasta agotar el aforo estudiantil configurado, genera un
registro de selección por cada uno (con su puntaje y posición congelados en
ese instante, RF-404) y su entrada, y encola el aviso — todo dentro de una
transacción, con la misma disciplina que el check-in de `003`: nunca debe
poder quedar una persona seleccionada sin su entrada, ni viceversa. RF-408
exige que no se pueda repetir sin revertir primero: se resuelve igual que
`ActivitiesService.cancel()` revierte el ledger de `003` — una reversión
explícita, auditada, dentro de una transacción, nunca destructiva (borra el
estado "seleccionado" de las filas, pero el registro de que existió y se
revirtió queda).

El control de acceso el día del evento reutiliza el mismo principio
anti-fraude de `checkin.md` (verificar en el servidor, nunca confiar en el
cliente) pero **sin rotación**: a diferencia del QR de puntos de `003`
(vive 60 segundos porque un punto ganado con una captura compartida es
fraude), la entrada es una credencial estática de un solo uso — el primer
escaneo gana, el segundo se rechaza con la hora del primero (RF-417),
mismo patrón exacto que ya usa `checkin.md` para `ALREADY_CHECKED_IN`.
Compartir una entrada es una realidad social de cualquier evento y no es lo
que RF-417 pide impedir; solo pide que no sirva dos veces.

## Fase -1: Gates previos a la implementación

### Gate de simplicidad (Artículo VII)

- [x] ¿Se usan ≤3 proyectos/módulos? — Sí, **un solo módulo**, `selection`.
      El diseño original habría justificado separar "invitaciones" de
      "control de acceso"; sin invitaciones ni lista de espera, no queda
      suficiente complejidad propia para justificar un segundo módulo — la
      única entidad nueva compartida (`Entry`) se crea en el mismo paso que
      genera la selección.
- [x] ¿No hay future-proofing? — Sí. Sin reemplazo automático de lugares
      liberados (ADR-009: es una acción manual del admin, no un algoritmo);
      sin plazos configurables que nadie pidió.

### Gate anti-abstracción (Artículo VIII)

- [x] Prisma directo, sin patrón repositorio.
- [x] Una sola representación: los tipos de Prisma son la respuesta,
      salvo donde el contrato agrega datos de varias tablas (la respuesta
      de ejecutar la selección, que lista a todos los seleccionados con su
      carrera).

### Gate integration-first (Artículo IX)

- [x] Contratos antes que código, en `contracts/`.
- [x] Pruebas de contrato primero (Grupo 1 de `tasks.md`).
- [x] Contra PostgreSQL real: la garantía de "no ejecutar dos veces sin
      revertir" y el índice único de "una entrada, un uso" viven en el
      motor, no en el código de aplicación — mismo argumento que ya
      justificó esto en `003`.

### Cumplimiento constitucional

- [x] **Artículo III (test-first, sin excepción para la asignación de
      lugares):** la ejecución de la selección tiene su propio grupo de
      pruebas de contrato antes de una sola línea de servicio, igual que el
      check-in en `003`.
- [x] **Artículo IV, en espíritu (RF-408):** revertir una selección no
      borra el registro de que se ejecutó ni de que se revirtió — inserta/
      marca, nunca elimina una fila que ya existía como evidencia.
- [x] **Artículo V:** el escaneo en la puerta lo hace `STAFF`/`ADMIN`
      autenticado; ejecutar/revertir la selección y asignar lugares a mano
      es exclusivo `ADMIN`.
- [x] **Artículo VI:** el escaneo en la puerta reutiliza el mismo
      presupuesto de latencia y el mismo criterio de "mensaje de error
      específico, nunca genérico" que ya exigió `checkin.md`.

## Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué esta opción | Requisito |
|---|---|---|---|
| Un solo módulo `selection` | Separar `selection`/`access-control` como en el diseño original de 2 módulos | Sin invitaciones ni lista de espera, el control de acceso es la única funcionalidad restante fuera de "ejecutar la selección" y es pequeña (2-3 endpoints) — separarla en su propio módulo repite el error ya corregido una vez en este proyecto de sobre-modularizar antes de tener la complejidad real que lo justifique. | Registro de complejidad de `plan.md` de `003`, mismo criterio |
| Reutilizar `events.capacity` existente (`002`) en vez de una tabla nueva | Tabla `EventCapacity` separada | `events` ya tiene una fila real para el TEDxUCB (`002-b`) con un campo `capacity` sin usar hasta ahora. Agregar `student_capacity` a esa misma fila evita una segunda fuente de verdad sobre "cuánta gente cabe" — el aforo total ya vivía ahí, solo le faltaba el desglose. | RF-401 |
| Entrada como token opaco hasheado, sin rotación | Reusar el patrón de QR rotativo de `003` (HMAC + TTL de segundos) | El QR de puntos rota porque una captura compartida sería fraude de puntos; una entrada compartida es una realidad social de cualquier evento, no algo que RF-417 pida impedir — solo pide que no sirva dos veces. Mismo patrón que `auth_tokens.token_hash` (001): se guarda el hash, nunca el token en claro. | RF-416, RF-417 |
| Reversión marca en vez de borrar | `DELETE` de las filas de selección al revertir | Borrar destruye la evidencia de quién fue seleccionado y por qué, justo lo que RF-408/Artículo IV existen para evitar. Revertir pone `revoked_at`+motivo+quién, visible después. | RF-408, Artículo IV (en espíritu) |
| Reasignar un lugar liberado es la misma operación que "asignar a mano" (RF-420), no un endpoint nuevo | Un endpoint "promover" separado | ADR-009: ambos casos son la misma acción — el admin marca a una persona concreta como seleccionada, fuera del resultado automático del ranking. No hay diferencia de negocio entre "cubrir una baja" y "asignar un lugar no estudiantil": los dos son asignación manual auditada. | ADR-009, RF-420, caso límite "lugar liberado" |

## Modelo de datos (resumen — detalle en `data-model.md`)

Tres entidades nuevas. `Selection` (una fila por persona seleccionada —
alumno por ranking o alguien asignado a mano — con su puntaje/posición
congelados si vino del ranking, su tipo de público, y si fue revertida).
`SelectionRun` (una fila por cada vez que se ejecuta la selección: cuándo,
quién, con qué aforo, revertida o no — lo que hace cumplir RF-408).
`Entry` (la credencial, 1:1 con `Selection`, con su hash, su uso y quién
validó el ingreso). `events.capacity`/`events.student_capacity` se agregan
a la tabla ya existente de `002`, no una tabla nueva.

## Contratos (resumen — detalle en `contracts/`)

- `POST /api/v1/selection/execute`, `POST /api/v1/selection/revert` — la
  operación crítica, con el mismo nivel de detalle que `checkin.md`.
- `GET /api/v1/selection` — resultado con distribución por carrera/facultad
  (RF-407a).
- `POST /api/v1/selection/manual` — asignar un lugar a mano (no
  estudiantil, o cubrir uno liberado).
- `GET /api/v1/selection/export` — lista final de asistentes (RF-421).
- `GET /api/v1/me/entry` — el alumno seleccionado consulta su propia
  entrada.
- `POST /api/v1/entries/scan` — el staff escanea en la puerta.
- `GET /api/v1/entries/live` — aforo ocupado en tiempo real.

Todo en `contracts/seleccion.md` — un solo archivo, coherente con el
único módulo.

## Orden de creación de archivos (test-first, obligatorio)

1. `contracts/seleccion.md`
2. Pruebas de contrato, luego de integración, luego unitarias
3. Migración y esquema de datos
4. Código fuente que hace pasar las pruebas anteriores

## Registro de complejidad

| Gate que falló | Por qué fue necesario | Alternativa más simple descartada y por qué |
|---|---|---|
| Ninguno — a diferencia de `001`/`002`/`003`, esta feature no necesitó ampliar más allá de 1 módulo ni justificar infraestructura nueva. | — | — |

## Validación / Quickstart (resumen — detalle en `quickstart.md`)

1. Ejecutar la selección con más alumnos que lugares: los mejores
   posicionados quedan seleccionados, el resto no recibe nada.
2. Ejecutarla dos veces sin revertir: la segunda se rechaza.
3. Revertir y volver a ejecutar: nueva selección, auditada la reversión.
4. Asignar un lugar a mano (no estudiantil, o cubriendo uno liberado).
5. Escanear una entrada válida, luego la misma otra vez: la segunda se
   rechaza con la hora de la primera.
6. Consultar el aforo ocupado en tiempo real durante el ingreso.
7. Exportar la lista final de asistentes.
