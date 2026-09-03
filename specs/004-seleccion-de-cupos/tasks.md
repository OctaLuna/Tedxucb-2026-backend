# Tareas: Selección de asistentes y control de acceso

**Fuente:** `plan.md`, `data-model.md`, `contracts/`
**Convención:** `[P]` = paralelizable con otras `[P]` del mismo grupo (no
comparten archivos ni dependen entre sí).

> **Grupo 0 cerrado (2026-09-03):** los 9 marcadores `[NECESITA
> CLARIFICACIÓN]` de `spec.md` se resolvieron con el responsable del
> proyecto — ver ADR-009. El diseño original (invitación con plazo, lista
> de espera, promoción automática) se eliminó del alcance.

---

## Grupo 0 — Desbloqueo (fase Clarify)

- [x] T001 ~~Resolver los 9 marcadores de `spec.md`~~ → **Resuelto
      2026-09-03:** sin confirmación, sin lista de espera, sin promoción
      automática (ADR-009); lugares no estudiantiles íntegramente
      manuales (RF-420); sin notificación a no seleccionados (RF-423);
      contingencia de lista impresa resuelta reutilizando RF-421, sin
      requisito nuevo.

## Grupo 1 — Contratos y pruebas (test-first, Artículo III)

Se escriben **antes** de cualquier código de implementación. Deben fallar.

- [ ] T010 [P] Prueba de contrato de `POST /selection/execute`: ciclo
      feliz (más alumnos que lugares → selecciona los mejores, excluye
      deshabilitados), `422 CAPACITY_NOT_CONFIGURED`,
      `409 SELECTION_ALREADY_ACTIVE`
- [ ] T011 [P] Prueba de contrato de `POST /selection/revert`:
      éxito (marca la ejecución y sus selecciones), `400 REASON_REQUIRED`,
      `404 NOT_FOUND`
- [ ] T012 [P] Prueba de contrato de `GET /selection`: datos + distribución
      por carrera/facultad (RF-407a), `404 NOT_FOUND` sin ejecución activa
- [ ] T013 [P] Prueba de contrato de `POST /selection/manual`: alumno por
      id, persona externa por nombre/correo, `400 REASON_REQUIRED`,
      `400 CONTACT_REQUIRED`, `409 ALREADY_SELECTED`
- [ ] T014 [P] Prueba de contrato de `POST /selection/:id/revoke`: éxito,
      `409 ALREADY_REVOKED`, `404 NOT_FOUND`
- [ ] T015 [P] Prueba de contrato de `GET /selection/export`: CSV con BOM,
      auditado
- [ ] T016 [P] Prueba de contrato de `GET /me/entry`: seleccionado,
      no seleccionado (`selected: false`, sin más datos — RF-423)
- [ ] T017 [P] Prueba de contrato de `POST /entries/scan`: éxito,
      `404 INVALID_ENTRY`, `409 ALREADY_USED` con hora y validador previos
- [ ] T018 [P] Prueba de contrato de `GET /entries/live`
- [ ] T019 Levantar PostgreSQL real en contenedor para las pruebas
      (Artículo IX — sin mocks; ya está arriba desde `001`, solo
      confirmar)
- [ ] T020 **Confirmar que T010–T018 fallan (fase Red) antes de continuar**

## Grupo 2 — Migraciones y modelo de datos

- [ ] T030 Ampliar `events` con `student_capacity` y sus `CHECK`
      (`data-model.md` §1) — reutiliza la tabla de `002`, no crea una
      nueva
- [ ] T031 Migración de `selection_runs` con el índice único parcial que
      impone RF-408 (`one_active_selection_run_per_event`)
- [ ] T032 Migración de `selections` con todos sus `CHECK` (`valid_source`,
      `ranking_has_run`, `ranking_has_snapshot`, `manual_needs_reason`,
      `contact_present`, `revoked_needs_reason`) y el índice único parcial
      `one_active_selection_per_student`
- [ ] T033 Prueba de integración de las restricciones: verificar que el
      motor rechaza directamente una segunda ejecución activa, una
      asignación manual sin motivo, y una selección `RANKING` sin `run_id`

## Grupo 3 — Selección (el núcleo)

Se implementa primero porque todo lo demás depende de él.

- [ ] T040 Servicio de ejecución: transacción completa de los pasos del
      contrato (crear `run`, seleccionar por ranking de `003` excluyendo
      deshabilitados, congelar puntaje/posición, generar entrada por cada
      uno) — mismo rigor transaccional que el check-in de `003`
- [ ] T041 Servicio de reversión: marca el `run` y sus `selections` vivas
      en cascada, dentro de una transacción, auditado
- [ ] T042 Consulta de resultado con distribución por carrera/facultad
      (RF-407a) — reutiliza el patrón de agregación ya usado en
      `points-and-leaderboard`
- [ ] T043 Servicio de asignación manual (alumno o persona externa),
      motivo obligatorio, genera entrada igual que la ejecución por
      ranking
- [ ] T044 Servicio de revocación individual de una selección
- [ ] T045 Exportación CSV con BOM UTF-8, auditada (mismo patrón que
      `LeaderboardService.exportCsv`)
- [ ] T046 Endpoints de `POST /selection/execute`, `/revert`,
      `GET /selection`, `POST /selection/manual`, `POST /selection/:id/revoke`,
      `GET /selection/export`, con guard de administrador
- [ ] T047 Agregar `studentCapacity` a `UpdateEventDto`/`CreateEventDto` del
      módulo `content` (`002`) — no es un endpoint nuevo de `004`

## Grupo 4 — Entradas y control de acceso

- [ ] T050 [P] Generación del código de entrada al crear una selección
      (hash guardado, código en claro solo en la respuesta/correo — mismo
      principio que `auth_tokens.token_hash`)
- [ ] T051 [P] `GET /me/entry`: el alumno consulta su propio resultado, sin
      revelar nada si no fue seleccionado (RF-423)
- [ ] T052 Servicio de escaneo: `UPDATE ... WHERE entry_code_hash = $1 AND
      entry_used_at IS NULL` condicionado (Artículo IX, sin lectura previa
      con condición de carrera)
- [ ] T053 `POST /entries/scan` con guard `STAFF`/`ADMIN` (sin asignación
      por actividad, a diferencia de `checkin.md` de `003`)
- [ ] T054 `GET /entries/live`: aforo ocupado en tiempo real (RF-419)
- [ ] T055 Encolado del aviso de selección (correo con el código de
      entrada) reutilizando `MailModule` de `002-c` — nuevo tipo de job en
      la misma cola `mail`, fuera de la transacción de T040

## Grupo 5 — Integración (escenarios de aceptación del spec)

- [ ] T060 Integración: ciclo completo de Historia 1 contra base de datos
      real — más alumnos que lugares, los mejores quedan seleccionados
- [ ] T061 Integración: ejecutar dos veces sin revertir falla
      (`SELECTION_ALREADY_ACTIVE`) — la prueba de idempotencia no
      negociable de este módulo, misma exigencia que tuvo el check-in en
      `003`
- [ ] T062 Integración: revertir y volver a ejecutar produce una nueva
      selección, con la anterior visible y marcada revertida en auditoría
      (trazabilidad, mismo criterio que la reversión de `points`)
- [ ] T063 Integración: escanear la misma entrada dos veces — la segunda
      rechazada con la hora de la primera, nunca dos ingresos
- [ ] T064 Integración: cubrir a mano un lugar liberado tras revocar una
      selección individual
- [ ] T065 Integración: la distribución por carrera/facultad del resultado
      coincide con lo realmente seleccionado

## Grupo 6 — Pulido

- [ ] T070 [P] Auditoría de `contracts/seleccion.md` contra el código
      real, mismo criterio que la auditoría T101 de `003-d` — no generar
      OpenAPI, sin infraestructura nueva
- [ ] T071 [P] `quickstart.md` de `004` con los pasos reales (equivalente a
      T102 de `003-d`)
- [ ] T072 Prueba de campo del escaneo en la puerta antes del evento real
      (equivalente al escenario 13 de `003`) — **no es una tarea que un
      agente pueda cerrar**, se anota pendiente operativo en
      `docs/progress.md`

---

## Orden de ejecución

```
Grupo 0 (desbloqueo, cerrado)
   ↓
Grupo 1 (pruebas en rojo) ──> Grupo 2 (migraciones)
                                   ↓
                              Grupo 3 (selección)
                                   ↓
                              Grupo 4 (entradas y acceso)
                                   ↓
                              Grupo 5 (integración)
                                   ↓
                              Grupo 6 (pulido)
```

**Regla:** ninguna tarea del Grupo 3 en adelante se marca completada si las
pruebas correspondientes del Grupo 1 no pasan.
