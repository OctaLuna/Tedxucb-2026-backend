# Tareas: Sitio público TEDxUCB

**Fuente:** `plan.md`, `data-model.md`, `contracts/`
**Convención:** `[P]` = paralelizable (no comparte archivos ni depende de
otra tarea del mismo grupo). Sin Grupo 0 — la fase Clarify de esta feature
ya está cerrada en `spec.md` antes de llegar aquí.

---

## Grupo 1 — Contratos y pruebas (test-first, Artículo III)

- [ ] T001 [P] Prueba de contrato de `GET /public/event`: ciclo feliz, `serverTime` presente y creciente entre dos llamadas, `eventStatus` correcto a ambos lados de `startsAt`
- [ ] T002 [P] Prueba de contrato: `EVENT_NOT_CONFIGURED` sin fila publicada
- [ ] T003 [P] Prueba de contrato de `GET/PATCH /events`, incluida `ANOTHER_EVENT_ALREADY_PUBLISHED`
- [ ] T004 [P] Prueba de contrato de `POST /events/:id/image` (válida, tipo inválido, tamaño excedido)
- [ ] T005 [P] Prueba de contrato de `content-blocks`: lectura pública, creación/edición admin, `DUPLICATE_KEY`
- [ ] T006 [P] Prueba de contrato de `GET /public/speakers`: vacío sin error, orden, exclusión estricta de `DRAFT`
- [ ] T007 [P] Prueba de contrato de CRUD admin de `speakers`, incluida `INCOMPLETE_SPEAKER` al intentar publicar sin foto/reseña
- [ ] T008 [P] Prueba de contrato de `POST /speakers/:id/photo` y de `POST /speakers/reorder`
- [ ] T009 [P] Prueba de contrato de `POST /public/applications`: ciclo feliz, validación, señuelo (sin fila creada), rate limit
- [ ] T010 [P] Prueba de contrato del panel admin de postulaciones: listado con `submissionsFromSameEmail`, filtros, `meta.total = 0`
- [ ] T011 [P] Prueba de contrato de `PATCH /applications/:id`: cambio de estado, notas internas, rechazo de `CONVERTED` manual
- [ ] T012 [P] Prueba de contrato de `POST /applications/:id/convert-to-speaker`: éxito con mapeo de campos, `INVALID_STATUS_TRANSITION`
- [ ] T013 Levantar PostgreSQL real para las pruebas (Artículo IX)
- [ ] T014 **Confirmar que T001–T012 fallan (fase Red) antes de continuar**

## Grupo 2 — Migraciones y modelo de datos

- [ ] T020 [P] Migración de `events` con `one_published_event` y sus `CHECK`
- [ ] T021 [P] Migración de `content_blocks` con `key_format`
- [ ] T022 Migración de `speakers` con `published_speaker_is_complete`
- [ ] T023 Migración de `speaker_applications` con todas sus restricciones e índices
- [ ] T024 Prueba de integración de restricciones: intentar publicar dos eventos a la vez, publicar un speaker incompleto, convertir dos veces la misma postulación
- [ ] T025 Semilla del Evento (fecha real, placeholder de hora marcado como tal) y de al menos un bloque de contenido con texto real del spec — **no** semilla de speakers (ver `data-model.md` §6)

## Grupo 3 — Módulo `content`

- [ ] T030 [P] `EventsService`: lectura pública (evento publicado + hora del servidor + `eventStatus`), CRUD admin
- [ ] T031 [P] `ContentBlocksService`: lectura pública, creación/edición admin
- [ ] T032 Endpoint `GET /public/event` con `Cache-Control: no-store`
- [ ] T033 [P] Endpoints admin de `events` (`GET`, `PATCH`, `POST .../image` reutilizando el patrón de `file-type` de `001/profiles`)
- [ ] T034 [P] Endpoints públicos y admin de `content-blocks`

## Grupo 4 — Módulo `speakers`: fichas públicas y admin

- [ ] T040 [P] `SpeakersService`: lectura pública (solo `PUBLISHED`, ordenados), CRUD admin
- [ ] T041 Endpoint `GET /public/speakers`
- [ ] T042 [P] Endpoints admin de `speakers` (`GET`, `POST`, `GET/:id`, `PATCH`) con traducción del `CHECK` a `422 INCOMPLETE_SPEAKER`
- [ ] T043 [P] Endpoint de subida de foto (`POST /speakers/:id/photo`), mismo patrón de validación que el avatar
- [ ] T044 Endpoint de reordenamiento en lote (`POST /speakers/reorder`) dentro de una transacción

## Grupo 5 — Módulo `speakers`: postulaciones

- [ ] T050 `ApplicationsService`: alta pública con detección de señuelo, sin persistir si el señuelo llegó relleno
- [ ] T051 Endpoint público `POST /public/applications` con `RateLimitGuard`
- [ ] T052 [P] Consulta admin con `submissionsFromSameEmail` (agrupación por `lower(email)`)
- [ ] T053 [P] Endpoint `PATCH /applications/:id`: transición de estado, notas internas, rechazo explícito de `CONVERTED` manual, registro en `audit_log`
- [ ] T054 Endpoint `POST /applications/:id/convert-to-speaker`: transacción completa (crea `Speaker` `DRAFT` con el mapeo de campos, marca la postulación `CONVERTED`)

## Grupo 6 — Correo de confirmación (infraestructura nueva)

- [ ] T060 `MailModule`/`MailService` en `src/common/mail/` sobre `nodemailer` + variables de entorno nuevas en `env.validation.ts` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`)
- [ ] T061 Job de BullMQ para el envío, con reintento y registro del resultado (nunca bloquea la respuesta de `POST /public/applications`)
- [ ] T062 Encolar el correo de confirmación (acuse de recibo simple, RF-213) después de confirmar la transacción de alta

## Grupo 7 — Integración (escenarios de aceptación del spec)

- [ ] T070 Integración: Historia 1 completa contra base real (evento + bloques de contenido, sin sesión)
- [ ] T071 Integración: Historia 2 completa — countdown antes y después de `startsAt`, reprogramación reflejada sin redeploy
- [ ] T072 Integración: Historia 3 completa — vacío, carga de prueba, publicación, despublicación sin borrado, reordenamiento
- [ ] T073 Integración: Historia 4 completa — postulación pública → panel admin → aceptación → conversión sin recaptura de datos
- [ ] T074 Integración: **concurrencia** — dos conversiones simultáneas de la misma postulación, una sola prospera
- [ ] T075 Integración: duplicados por correo — dos postulaciones, panel muestra el conteo correcto

## Grupo 8 — Pulido

- [ ] T080 [P] Documentación OpenAPI generada y verificada contra `contracts/`
- [ ] T081 [P] Medir tamaño/tiempo de respuesta de `GET /public/event`, `/public/speakers`, `/content-blocks` contra el presupuesto de CE-205
- [ ] T082 Cerrar el checklist de salida a producción: fecha/hora real del evento, sede real, imagen Open Graph real, credenciales SMTP reales (ver notas de semilla en `data-model.md` y de infraestructura de correo en `plan.md`)

---

## Orden de ejecución

```
Grupo 1 (pruebas en rojo) --> Grupo 2 (migraciones + seed)
                                    |
                     +------ Grupo 3 (content) ------+
                     |                                |
                     +--> Grupo 4 (speakers: fichas) -+
                                    |                  |
                          Grupo 5 (postulaciones) -----+
                                    |                  |
                          Grupo 6 (correo) ------------+
                                    |
                          Grupo 7 (integración)
                                    |
                          Grupo 8 (pulido)
```

**Regla:** ninguna tarea del Grupo 3 en adelante se marca completada si las
pruebas correspondientes del Grupo 1 no pasan.
