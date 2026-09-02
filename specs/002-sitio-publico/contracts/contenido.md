# Contrato: Bloques de contenido (índice)

**Feature:** `002-sitio-publico` · **Requisitos:** RF-202, RF-203

| Ruta | Método | Autorización | Qué hace | Modos de fallo principales |
|---|---|---|---|---|
| `/api/v1/content-blocks` | `GET` | Ninguna | Lista completa, sin paginar (colección acotada, controlada por producto). Rate limit `public-content-blocks`, 60/60s. | — |
| `/api/v1/content-blocks/:key` | `GET` | Ninguna | Un bloque puntual. | `404 NOT_FOUND` |
| `/api/v1/content-blocks` | `POST` | `ADMIN` | Crea una clave nueva. | `409 DUPLICATE_KEY`, `400 VALIDATION_ERROR` (formato de `key`) |
| `/api/v1/content-blocks/:key` | `PATCH` | `ADMIN` | Edita `title`/`body` de una clave existente (RF-203: sin desplegar código). | `404 NOT_FOUND` |

Mismo patrón de ruta compartida entre lectura pública y escritura admin que
`faculties`/`careers` en `001` — aquí sí es seguro, porque un bloque de
contenido no tiene estado "no publicado" que deba protegerse (a diferencia
de `speakers`/`applications`, ver `plan.md`).
