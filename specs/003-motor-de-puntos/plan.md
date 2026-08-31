# Plan de implementación: Motor de puntos y participación

**Basado en:** `specs/003-motor-de-puntos/spec.md`
**Stack propuesto por el usuario:** NestJS + TypeScript + PostgreSQL + Prisma,
monolito modular (acordado en la conversación previa a la adopción de SDD)

> Este documento se mantiene de alto nivel. El esquema detallado está en
> `data-model.md`, los contratos de API en `contracts/`, y los escenarios de
> validación manual en `quickstart.md`.

## Resumen técnico

El motor de puntos se construye alrededor de un **libro mayor de solo
inserción**. Cada movimiento de puntos es una fila que nunca se modifica ni se
borra; el puntaje agregado del alumno es una caché derivada que puede
reconstruirse en cualquier momento sumando ese libro. Esta decisión es la
traducción directa del Artículo IV de la constitución y condiciona todo lo
demás: no hay operación de "corregir puntos", solo de "registrar una corrección".

La operación crítica es el check-in. Ocurre en campo, con red inestable y una
fila esperando, y debe ser atómica e idempotente: el registro de participación,
el movimiento de puntos y la actualización de la caché ocurren dentro de una
única transacción de base de datos, protegida por dos garantías del motor —un
índice único parcial que impide dos asistencias vivas del mismo alumno en la
misma actividad, y una clave de idempotencia única en el libro mayor que
neutraliza los reintentos por pérdida de red. Ninguna de las dos vive en el
código de aplicación, porque el código de aplicación pierde la carrera ante dos
peticiones concurrentes; el motor de base de datos no.

La identificación del alumno se resuelve con un token firmado de vida corta que
rota en su pantalla. El staff, autenticado y asignado explícitamente a la
actividad, es quien escanea. Esto invierte la confianza respecto al modelo
ingenuo (un QR pegado en la pared que el alumno escanea): el dispositivo que
otorga puntos es el dispositivo controlado, y una captura de pantalla del código
del alumno caduca antes de poder circular por WhatsApp.

## Fase -1: Gates previos a la implementación

### Gate de simplicidad (Artículo VII)

- [ ] ¿Se usan ≤3 proyectos/módulos? — **FALLA**, ver Registro de complejidad
- [x] ¿No hay future-proofing / features especulativas? — Sí. Se descartó el
      modelo de escaneo alternativo para actividades masivas hasta confirmar que
      existen (RF-323 sin resolver). No se construye lo que no está confirmado.

### Gate anti-abstracción (Artículo VIII)

- [x] ¿Se usa el framework directamente? — Sí. Prisma se usa directamente, sin
      patrón repositorio encima: el ORM ya es esa capa.
- [x] ¿Una sola representación del modelo de datos? — Sí. Los tipos generados por
      Prisma son la única representación. Solo existen DTO donde el contrato
      público difiere realmente de la entidad (por ejemplo, la respuesta del
      check-in, que agrega datos de tres tablas).

### Gate integration-first (Artículo IX)

- [x] ¿Los contratos están definidos? — Sí, en `contracts/`, antes que el código.
- [x] ¿Existen pruebas de contrato planeadas? — Sí, grupo 1 de `tasks.md`, y son
      lo primero que se escribe.
- [x] ¿Se prueba contra servicios reales? — Sí. PostgreSQL real en contenedor.
      Probar el check-in contra un mock validaría exactamente nada: la corrección
      depende de restricciones e índices que un doble de prueba no reproduce.

### Cumplimiento constitucional (Artículos IV–VI)

- [x] **IV, auditabilidad:** libro mayor de solo inserción, correcciones por
      reversión, caché reconstruible, idempotencia en toda operación de puntos.
- [x] **V, privilegio mínimo:** el staff valida solo donde está asignado,
      verificado por guard con consulta a la asignación, no por confianza en el
      cliente. Toda acción sensible auditada.
- [x] **VI, fiabilidad de campo:** presupuesto de 500 ms p95 para el check-in,
      respuesta con confirmación visual completa, reintento seguro por diseño,
      duplicado con mensaje explicativo.

## Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué esta opción | Requisito |
|---|---|---|---|
| Libro mayor de solo inserción | Campo de puntaje mutable; tabla de historial paralela puramente informativa | Un campo mutable no puede explicar cómo llegó a su valor. La tabla paralela se desincroniza en cuanto alguien escribe directo. Con el libro mayor como fuente única, el puntaje siempre es defendible ante un reclamo. | RF-324 a RF-327 |
| Puntaje agregado como caché | Sumar el libro en cada consulta | Sumar en vivo es correcto pero lento para ordenar cientos de alumnos por puntaje en cada carga del ranking. La caché se protege con reconciliación diaria y puede reconstruirse. | RF-338, CE-303 |
| Idempotencia por clave única en base de datos | Deduplicación por ventana temporal en la aplicación | La red del campus fallará. Una ventana temporal en memoria pierde ante dos instancias del servidor o un reinicio; la restricción única del motor no. | RF-317 |
| Índice único parcial sobre asistencias vivas | Verificar existencia antes de insertar | La verificación previa tiene una condición de carrera: dos escaneos simultáneos pasan ambos. El índice único la elimina de raíz. | RF-315 |
| Token firmado de vida corta, rotando en pantalla del alumno | QR estático impreso del alumno; QR fijo pegado en el lugar | El QR estático se fotografía y circula. La rotación hace que la captura caduque antes de ser útil, sin exigir nada al alumno. | RF-312, Historia 6 |
| El staff escanea al alumno | El alumno escanea el código del lugar | El dispositivo que otorga puntos queda del lado controlado y autenticado. Además deja registrado quién validó a quién, que es lo que permite investigar una anomalía. | RF-305, RF-320 |
| Reversión en lugar de edición | Editar o borrar el movimiento erróneo | Editar destruye la evidencia justo cuando más se necesita: durante un reclamo. La reversión conserva ambos hechos y los muestra al alumno. | RF-325, RF-326 |
| Bloqueo de fila al actualizar el puntaje | Bloqueo optimista con reintentos | El punto de contención es una sola fila por alumno y las escrituras son breves. El bloqueo pesimista es más simple de razonar y no genera reintentos bajo carga de escaneo simultáneo. | RF-314 |
| Reconciliación programada diaria | Confiar en la atomicidad de la transacción | La transacción es correcta, pero una migración mal hecha o una intervención manual pueden desincronizar la caché. Detectarlo al día siguiente es barato; descubrirlo el día del corte, no. | RF-332, CE-303 |

## Modelo de datos (resumen — detalle en `data-model.md`)

Seis entidades. `Activity` y `ActivityCategory` definen qué otorga puntos y
cuántos. `ActivityStaff` materializa quién puede validar dónde, y es lo que
consulta el guard de permisos. `Attendance` registra el hecho de la
participación con su método y validador. `PointTransaction` es el libro mayor:
la única fuente de verdad del puntaje, con referencias a la asistencia que lo
originó y, en el caso de una reversión, al movimiento que anula. `PointClaim`
soporta el canal de reclamos.

La relación entre `Attendance` y `PointTransaction` es uno a uno y se crea en la
misma transacción: no puede existir una asistencia sin su movimiento de puntos
ni al revés.

## Contratos (resumen — detalle en `contracts/`)

- `POST /activities/:id/checkin` — la operación crítica. Contrato completo en
  `contracts/checkin.md`, incluyendo los seis modos de fallo.
- `POST /activities/:id/checkin/manual` — alternativa con justificación
  obligatoria.
- `GET /me/qr` — token rotativo del alumno.
- `GET /me/points` — historial paginado.
- `POST /points/adjustments` y `POST /points/:id/reverse` — correcciones.
- `POST /claims` y `PATCH /claims/:id` — reclamos.
- `GET /leaderboard` — ranking.

## Orden de creación de archivos (test-first, obligatorio)

1. `contracts/` — especificaciones de la API
2. Pruebas de contrato, luego de integración, luego unitarias
3. Migraciones y esquema de datos
4. Código fuente que hace pasar las pruebas anteriores

## Registro de complejidad

| Gate que falló | Por qué fue necesario | Alternativa más simple descartada y por qué |
|---|---|---|
| Simplicidad (Art. VII): la propuesta original declaraba 14 módulos NestJS, muy por encima del límite de 3 | Se reduce a **3 módulos para esta feature**: `activities` (actividades, staff asignado, asistencias), `points` (libro mayor, ajustes, reversiones, reclamos) y `leaderboard` (ranking y consultas agregadas). El límite se cumple dentro del alcance de la feature. Los módulos transversales de identidad y contenido pertenecen a `001` y `002` y se contabilizan allí. | Se descartó fusionar todo en un módulo único: mezclar el libro mayor con la gestión de actividades haría que la lógica más sensible del sistema —la que decide quién entra al evento— quedara diluida entre operaciones de mantenimiento de catálogo, y perdería su propia frontera de pruebas. La separación de `points` como módulo aislado es exactamente lo que exige el Artículo I. |

## Validación / Quickstart (resumen — detalle en `quickstart.md`)

1. Ciclo feliz completo: crear actividad, publicar, asignar staff, escanear
   alumno, verificar puntos en el perfil.
2. Doble escaneo: verificar rechazo con la hora del primer registro y ausencia
   de doble abono.
3. Token vencido: verificar rechazo.
4. Reversión: revertir una carga y verificar que el historial muestra ambos
   movimientos y el puntaje correcto.
5. Reconciliación: alterar la caché manualmente y verificar que el proceso la
   detecta y la corrige.
