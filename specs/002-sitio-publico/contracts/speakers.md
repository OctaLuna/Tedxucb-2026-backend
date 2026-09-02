# Contrato: Speakers (índice)

**Feature:** `002-sitio-publico` · **Requisitos:** RF-206 a RF-209, RF-217

| Ruta | Método | Autorización | Qué hace | Modos de fallo principales |
|---|---|---|---|---|
| `/api/v1/public/speakers` | `GET` | Ninguna | Solo `status = 'PUBLISHED'`, ordenados por `displayOrder`. Lista vacía sin error si no hay ninguno (RF-208). Sin paginación (colección acotada por naturaleza). Rate limit `public-speakers`, 60/60s. | — |
| `/api/v1/speakers` | `GET` | `ADMIN` | Lista paginada, incluye `DRAFT`. | — |
| `/api/v1/speakers` | `POST` | `ADMIN` | Crea en `DRAFT`. | `400 VALIDATION_ERROR` |
| `/api/v1/speakers/:id` | `GET` | `ADMIN` | Detalle. | `404 NOT_FOUND` |
| `/api/v1/speakers/:id` | `PATCH` | `ADMIN` | Edita campos y/o `status`. Publicar con datos incompletos falla — no por el servicio, por el `CHECK published_speaker_is_complete` (ver `data-model.md`), traducido a `422 INCOMPLETE_SPEAKER` con `details` listando los campos faltantes. | `404 NOT_FOUND`, `422 INCOMPLETE_SPEAKER` |
| `/api/v1/speakers/:id/photo` | `POST` | `ADMIN` | `multipart/form-data`, mismo patrón que el avatar de `001`. Responde `{ photoUrl }`. | `422 INVALID_IMAGE`, `413 FILE_TOO_LARGE` |
| `/api/v1/speakers/reorder` | `POST` | `ADMIN` | Recibe la lista completa de ids en el orden deseado; reescribe `displayOrder` para todos en una sola transacción (RF-209). | `400 VALIDATION_ERROR` (algún id no pertenece al conjunto actual) |

No existe `DELETE /speakers/:id` — el caso límite del spec es explícito:
un speaker se despublica (`PATCH status: "DRAFT"`), nunca se borra.
