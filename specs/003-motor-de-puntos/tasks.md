# Tareas: Motor de puntos y participación

**Fuente:** `plan.md`, `data-model.md`, `contracts/`
**Convención:** `[P]` = paralelizable con otras `[P]` del mismo grupo (no
comparten archivos ni dependen entre sí).

> **Estado del bloqueo (2026-08-30):** RF-310 resuelto — el grupo 2 queda
> desbloqueado y la implementación puede empezar. Los marcadores restantes del
> grupo 0 no impiden arrancar, pero la feature no se da por terminada mientras
> sigan abiertos.
>
> **Nuevo prerrequisito derivado de `001`:** el check-in debe rechazar a alumnos
> cuya cuenta esté pendiente de verificación (RF-122). Ver T068.

---

## Grupo 0 — Desbloqueo (fase Clarify)

- [x] T000 ~~Resolver RF-310~~ → **Resuelto 2026-08-30:** sin escala fija; el administrador define el valor al crear cada actividad. Se añade valor sugerido por categoría (RF-310a) para evitar incoherencias.
- [ ] T001 Resolver RF-342: visibilidad del ranking para los alumnos
- [ ] T002 Resolver RF-322: umbral de anomalía por dispositivo
- [ ] T003 Resolver RF-323: ¿existen actividades masivas que requieran otro modo de registro?
- [ ] T004 Resolver el caso límite de cupo lleno y la vigencia del token QR
- [ ] T005 Resolver RF-337: plazo de cierre de reclamos antes del corte

## Grupo 1 — Contratos y pruebas (test-first, Artículo III)

Se escriben **antes** de cualquier código de implementación. Deben fallar.

- [ ] T010 [P] Prueba de contrato del ciclo feliz de check-in en `tests/contract/checkin.spec.ts`
- [ ] T011 [P] Prueba de contrato de los seis modos de fallo del check-in
- [ ] T012 [P] Prueba de contrato de check-in manual (con y sin justificación)
- [ ] T013 [P] Prueba de contrato de `GET /me/qr` y rechazo de token vencido
- [ ] T014 [P] Prueba de contrato de `GET /me/points` con reversión visible
- [ ] T015 [P] Prueba de contrato de ajustes: motivo obligatorio, cero puntos, truncamiento a cero
- [ ] T016 [P] Prueba de contrato de reversión: éxito, doble reversión, reversión de reversión
- [ ] T017 [P] Prueba de contrato de reclamos: alta, duplicado abierto, aprobación, rechazo
- [ ] T018 [P] Prueba de contrato del ranking: orden, desempate determinista, exclusión de deshabilitados
- [ ] T019 Levantar PostgreSQL real en contenedor para las pruebas (Artículo IX — sin mocks)
- [ ] T020 **Confirmar que T010–T018 fallan (fase Red) antes de continuar**

## Grupo 2 — Migraciones y modelo de datos

- [ ] T030 [P] Migración de `activity_categories` y `activities` con sus restricciones
- [ ] T031 [P] Migración de `activity_staff`
- [ ] T032 Migración de `attendances` con el índice único parcial y `manual_requires_note`
- [ ] T033 Migración de `point_transactions` con todas sus restricciones e índices únicos
- [ ] T034 Trigger que prohíbe `UPDATE` y `DELETE` sobre el libro mayor, y revocación de privilegios al rol de aplicación
- [ ] T035 [P] Migración de `point_claims` con el índice parcial de reclamo abierto único
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

## Grupo 6 — Reclamos y ranking

- [ ] T070 [P] Servicio de reclamos: alta, listado, resolución
- [ ] T071 Aprobación de reclamo: crea asistencia con método `CLAIM` y otorga puntos en la misma transacción
- [ ] T072 [P] Cierre de reclamos por vencimiento de plazo — **bloqueada por T005**
- [ ] T073 [P] Consulta de ranking con desempate determinista y filtros
- [ ] T074 Endpoint de progreso individual del alumno
- [ ] T075 Exportación del ranking en formato tabular

## Grupo 7 — Integración (escenarios de aceptación del spec)

- [ ] T080 Integración: ciclo completo de la Historia 1 contra base de datos real
- [ ] T081 Integración: **concurrencia** — dos check-ins simultáneos del mismo alumno, uno solo prospera
- [ ] T082 Integración: **idempotencia** — reintento tras fallo de red no duplica puntos
- [ ] T083 Integración: reversión y trazabilidad completa en el historial
- [ ] T084 Integración: cambio de valor de actividad no recalcula lo ya otorgado
- [ ] T085 Integración: flujo completo de reclamo aprobado
- [ ] T086 Integración: la reconciliación detecta y corrige una caché alterada a mano

## Grupo 8 — Anomalías y observabilidad

- [ ] T090 [P] Detección de anomalías por dispositivo — **bloqueada por T002**
- [ ] T091 [P] Auditoría de toda acción sensible: ajustes, reversiones, cambios de valor, cancelaciones
- [ ] T092 [P] Reconciliación programada diaria con alerta
- [ ] T093 [P] Métricas de check-in: latencia p95 y proporción de registros manuales (CE-301, CE-304)

## Grupo 9 — Pulido

- [ ] T100 [P] Límites de frecuencia diferenciados para el endpoint de check-in
- [ ] T101 [P] Documentación OpenAPI generada y verificada contra `contracts/`
- [ ] T102 [P] Actualizar `quickstart.md` con los pasos reales tras la implementación
- [ ] T103 **Ejecutar el escenario 14 en campo** con red del campus y teléfonos de gama media, antes de la primera actividad real
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
                              Grupo 6 (reclamos y ranking)
                                   ↓
                              Grupo 7 (integración)
                                   ↓
                          Grupos 8 y 9 (paralelizables)
```

**Regla:** ninguna tarea de los grupos 3 en adelante se marca completada si las
pruebas correspondientes del grupo 1 no pasan. Si una tarea exige una decisión
que el plan no tomó, se vuelve a la fase Plan o se pide clarificación, en lugar
de improvisar en silencio.
