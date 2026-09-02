# Tareas: Motor de puntos y participación

**Fuente:** `plan.md`, `data-model.md`, `contracts/`
**Convención:** `[P]` = paralelizable con otras `[P]` del mismo grupo (no
comparten archivos ni dependen entre sí).

> **Estado del bloqueo (2026-08-30):** RF-310 resuelto — el grupo 2 queda
> desbloqueado y la implementación puede empezar.
>
> **Nuevo prerrequisito derivado de `001`:** el check-in debe rechazar a alumnos
> cuya cuenta esté pendiente de verificación (RF-122). Ver T068.
>
> **Grupo 0 cerrado (2026-09-02):** T001-T005 resueltos con el responsable
> del proyecto. `003` queda en 0 marcadores `[NECESITA CLARIFICACIÓN]`
> abiertos (el conteo real era 9, no 10 ni 6 — ver `specs/README.md`). Una
> de las decisiones (T005) elimina la Historia 5 completa (reclamos) — ver
> ADR-008 — y con ella las tareas T017, T035, T070, T071, T072 y T085 de
> más abajo, ya tachadas.
>
> **Corrección de secuencia (2026-09-02):** T033, T034 y T036 se ejecutan
> como parte de `003-a` (el check-in de ese módulo no puede existir sin
> ellas), aunque el prompt `003-a-modulo-activities.md` solo mencionaba
> T030/T031/T032/T038 en su Paso 1. `003-b` verifica que ya existen en vez
> de repetirlas.

---

## Grupo 0 — Desbloqueo (fase Clarify)

- [x] T000 ~~Resolver RF-310~~ → **Resuelto 2026-08-30:** sin escala fija; el administrador define el valor al crear cada actividad. Se añade valor sugerido por categoría (RF-310a) para evitar incoherencias.
- [x] T001 ~~Resolver RF-342~~ → **Resuelto 2026-09-02:** ranking completo visible para todos los alumnos autenticados, no solo la posición propia.
- [x] T002 ~~Resolver RF-322~~ → **Resuelto 2026-09-02:** sin umbral fijo por ahora. T090 queda como deuda técnica explícita, no bloqueante.
- [x] T003 ~~Resolver RF-323~~ → **Resuelto 2026-09-02:** no existen actividades masivas confirmadas. No se construye una alternativa de registro.
- [x] T004 ~~Resolver el caso límite de cupo lleno y la vigencia del token QR~~ → **Resuelto 2026-09-02:** las actividades no tienen límite de asistentes (se elimina `capacity` y `422 ACTIVITY_FULL`); vigencia del token QR confirmada en 60 segundos.
- [x] T005 ~~Resolver RF-337~~ → **Resuelto 2026-09-02, cambio de alcance:** se elimina toda la Historia 5 (reclamos: `PointClaim`, endpoints de `claims`, RF-334 a RF-337) y el concepto de fecha de corte del ranking — el ranking es una vista continua, sin evento de cierre. Ver ADR-008.

## Grupo 1 — Contratos y pruebas (test-first, Artículo III)

Se escriben **antes** de cualquier código de implementación. Deben fallar.

- [ ] T010 [P] Prueba de contrato del ciclo feliz de check-in en `tests/contract/checkin.spec.ts`
- [ ] T011 [P] Prueba de contrato de los seis modos de fallo del check-in (composición 2026-09-02: sin `ACTIVITY_FULL`, con `STUDENT_NOT_VERIFIED` — ver `contracts/checkin.md`)
- [ ] T012 [P] Prueba de contrato de check-in manual (con y sin justificación)
- [ ] T013 [P] Prueba de contrato de `GET /me/qr` y rechazo de token vencido
- [ ] T014 [P] Prueba de contrato de `GET /me/points` con reversión visible
- [ ] T015 [P] Prueba de contrato de ajustes: motivo obligatorio, cero puntos, truncamiento a cero
- [ ] T016 [P] Prueba de contrato de reversión: éxito, doble reversión, reversión de reversión
- [x] ~~T017~~ eliminada 2026-09-02 — Historia 5/reclamos ya no existe (ver ADR-008).
- [ ] T018 [P] Prueba de contrato del ranking: orden, desempate determinista, exclusión de deshabilitados
- [ ] T019 Levantar PostgreSQL real en contenedor para las pruebas (Artículo IX — sin mocks)
- [ ] T020 **Confirmar que T010–T018 fallan (fase Red) antes de continuar**

## Grupo 2 — Migraciones y modelo de datos

- [ ] T030 [P] Migración de `activity_categories` y `activities` con sus restricciones
- [ ] T031 [P] Migración de `activity_staff`
- [ ] T032 Migración de `attendances` con el índice único parcial y `manual_requires_note`
- [ ] T033 Migración de `point_transactions` con todas sus restricciones e índices únicos
- [ ] T034 Trigger que prohíbe `UPDATE` y `DELETE` sobre el libro mayor, y revocación de privilegios al rol de aplicación
- [x] ~~T035~~ eliminada 2026-09-02 — `point_claims` ya no existe (ver ADR-008).
- [ ] T036 Añadir `total_points` a `student_profiles` con su `CHECK` e índice descendente
- [ ] T037 Prueba de integración de las restricciones: verificar que el motor rechaza directamente un doble check-in, un movimiento sin motivo y un `UPDATE` sobre el libro mayor
- [ ] T038 Semillas de categorías de actividad con su valor sugerido (RF-310a) — **desbloqueada**

## Grupo 3 — Módulo de puntos (el núcleo)

Se implementa primero porque todo lo demás depende de él.

- [ ] T040 Servicio de libro mayor: registrar movimiento con clave de idempotencia, dentro de transacción y con bloqueo de fila
- [ ] T041 Truncamiento a cero de penalizaciones que excedan el saldo
- [ ] T042 Servicio de reversión con validación de doble reversión
- [ ] T043 Servicio de ajustes con motivo obligatorio
- [ ] T044 Consulta de historial paginado con reversiones y resumen
- [ ] T045 Servicio de reconciliación: comparar caché contra suma del libro mayor
- [ ] T046 Comando de consola `points-cli reconcile` con salida JSON (Artículo II)
- [ ] T047 Endpoints de ajustes y reversión con guard de administrador

## Grupo 4 — Tokens QR y actividades

- [ ] T050 [P] Servicio de emisión de token firmado con vigencia corta
- [ ] T051 [P] Servicio de verificación de token: firma, vigencia, alumno existente y activo
- [ ] T052 Endpoint `GET /me/qr`
- [ ] T053 [P] CRUD de actividades con máquina de estados (borrador, publicada, cerrada, cancelada)
- [ ] T054 [P] Asignación y retiro de staff por actividad
- [ ] T055 `ActivityStaffGuard`: verifica asignación explícita, no solo el rol
- [ ] T056 Impedir eliminación de actividades con asistencias; ofrecer cancelación
- [ ] T057 Reversión en bloque al cancelar una actividad, con confirmación del administrador

## Grupo 5 — Check-in (satisface T010–T013)

- [ ] T060 Servicio de check-in: la transacción completa de los siete pasos del contrato
- [ ] T061 Manejo del conflicto de idempotencia: devolver `200` con el resultado previo, no un error
- [ ] T062 Manejo del duplicado: `409` con hora y validador del registro previo
- [ ] T063 Validación de ventana de check-in y estado de la actividad
- [ ] T064 Endpoint de check-in con respuesta enriquecida: nombre, foto, código, puntos, nuevo total
- [ ] T065 Check-in manual con justificación obligatoria
- [ ] T066 Registro de `device_hash` e `ip_address` en cada asistencia
- [ ] T067 Encolado de notificación **después** de confirmar la transacción
- [ ] T068 Rechazar el check-in de alumnos con cuenta pendiente de verificación (RF-122, derivado del auto-registro de `001`)

## Grupo 6 — Ranking

- [x] ~~T070~~ eliminada 2026-09-02 — servicio de reclamos, ya no existe.
- [x] ~~T071~~ eliminada 2026-09-02 — aprobación de reclamo, ya no existe.
- [x] ~~T072~~ eliminada 2026-09-02 — ya no depende de T005 porque no hay nada que cerrar.
- [ ] T073 [P] Consulta de ranking con desempate determinista y filtros
- [ ] T074 Endpoint de progreso individual del alumno
- [ ] T075 Exportación del ranking en formato tabular

## Grupo 7 — Integración (escenarios de aceptación del spec)

- [ ] T080 Integración: ciclo completo de la Historia 1 contra base de datos real
- [ ] T081 Integración: **concurrencia** — dos check-ins simultáneos del mismo alumno, uno solo prospera
- [ ] T082 Integración: **idempotencia** — reintento tras fallo de red no duplica puntos
- [ ] T083 Integración: reversión y trazabilidad completa en el historial
- [ ] T084 Integración: cambio de valor de actividad no recalcula lo ya otorgado
- [x] ~~T085~~ eliminada 2026-09-02 — flujo de reclamo aprobado, ya no existe.
- [ ] T086 Integración: la reconciliación detecta y corrige una caché alterada a mano

## Grupo 8 — Anomalías y observabilidad

- [ ] T090 [P] Detección de anomalías por dispositivo — resuelto el bloqueo (T002, sin umbral fijo). Queda como deuda técnica explícita, no se implementa en esta ronda; reabrir cuando haya datos reales de campo.
- [ ] T091 [P] Auditoría de toda acción sensible: ajustes, reversiones, cambios de valor, cancelaciones
- [ ] T092 [P] Reconciliación programada diaria con alerta
- [ ] T093 [P] Métricas de check-in: latencia p95 y proporción de registros manuales (CE-301, CE-304)

## Grupo 9 — Pulido

- [ ] T100 [P] Límites de frecuencia diferenciados para el endpoint de check-in
- [ ] T101 [P] Documentación OpenAPI generada y verificada contra `contracts/`
- [ ] T102 [P] Actualizar `quickstart.md` con los pasos reales tras la implementación
- [ ] T103 **Ejecutar el escenario 13 en campo** con red del campus y teléfonos de gama media, antes de la primera actividad real (renumerado 2026-09-02, antes escenario 14 — se eliminó el escenario de reclamos)
- [ ] T104 Prueba de carga del check-in con escaneo simultáneo

---

## Orden de ejecución

```
Grupo 0 (desbloqueo)
   ↓
Grupo 1 (pruebas en rojo) ──> Grupo 2 (migraciones)
                                   ↓
                              Grupo 3 (puntos)
                                   ↓
                              Grupo 4 (QR y actividades)
                                   ↓
                              Grupo 5 (check-in)
                                   ↓
                              Grupo 6 (ranking)
                                   ↓
                              Grupo 7 (integración)
                                   ↓
                          Grupos 8 y 9 (paralelizables)
```

**Regla:** ninguna tarea de los grupos 3 en adelante se marca completada si las
pruebas correspondientes del grupo 1 no pasan. Si una tarea exige una decisión
que el plan no tomó, se vuelve a la fase Plan o se pide clarificación, en lugar
de improvisar en silencio.
