# Contrato: Postulación de speakers

**Feature:** `002-sitio-publico`
**Requisitos que satisface:** RF-210 a RF-215, casos límite de duplicados y
formato TED

---

## `POST /api/v1/public/applications`

Registra una postulación pública de speaker.

**Autorización:** ninguna. Ruta pública.

**Rate limit:**
`{ keyPrefix: 'public-applications', limit: 5, windowSeconds: 3600 }` — misma
magnitud que `register` y `password-reset` en `001`: un formulario público
que un mismo visitante legítimo llena, como mucho, un puñado de veces por
hora.

### Petición

```json
{
  "fullName": "Ana Lucía Fernández Rojas",
  "email": "ana.fernandez@ejemplo.com",
  "affiliation": "Directora de Sostenibilidad, Empresa X",
  "expertiseArea": "Economía circular",
  "ideaTitle": "Lo que el desperdicio industrial nos puede enseñar sobre gobernanza",
  "ideaSummary": "Un modelo de economía circular aplicado a...",
  "evidenceBasis": "Estudio de caso propio en 12 empresas bolivianas entre 2023 y 2025...",
  "applicability": "Replicable en cualquier industria con cadena de suministro local...",
  "website": ""
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `fullName` | string | sí | Nombre del postulante. |
| `email` | string | sí | Correo de contacto. No se valida contra ningún dominio institucional — cualquier persona de fuera de la UCB puede postular. |
| `affiliation` | string | sí | Afiliación profesional/institucional. |
| `expertiseArea` | string | sí | Área de expertise. |
| `ideaTitle` | string | sí | Título de la idea propuesta. |
| `ideaSummary` | string | sí | Resumen de la idea. |
| `evidenceBasis` | string | sí | Base de evidencia — el filtro real del formato TED (Contexto del spec). |
| `applicability` | string | sí | Aplicabilidad real de la idea. |
| `website` | string | no (señuelo) | **Campo trampa.** El frontend lo renderiza oculto por CSS; un visitante humano nunca lo completa. Si llega con contenido, la petición se responde como si hubiera tenido éxito (`201`, mismo formato) pero **no se persiste ninguna fila** — no se le da a un script la señal de que fue detectado. |

### Respuesta exitosa — `201 Created`

```json
{
  "id": "7c1e4a2f-...",
  "status": "PENDING",
  "createdAt": "2026-09-01T14:32:04Z"
}
```

Deliberadamente mínima: quien llena el formulario ya tiene sus propios datos
en pantalla; no hace falta que el backend se los repita. Sirve para que el
frontend confirme "recibido" y dispare, del lado del cliente, cualquier
evento de analítica que necesite.

### Modos de fallo

| Código | `error` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Falta algún campo obligatorio o no cumple el formato esperado (formato uniforme del proyecto, `details.fields`). |
| `429` | `TOO_MANY_REQUESTS` | Límite de frecuencia superado. |

No hay `409` de duplicado: el caso límite del spec permite explícitamente
reenvíos del mismo correo. A diferencia del registro de `001`, aquí **no**
hay riesgo de enumeración por esta razón — nunca se revela si un correo ya
postuló antes, porque nunca se rechaza por eso.

### Garantías

- La fila se inserta con `status = 'PENDING'`, `ip_address` capturada del
  request.
- El correo de confirmación (RF-213 — acuse de recibo simple, sin fechas ni
  plazos) se **encola** después de confirmar la inserción, nunca dentro de
  la misma transacción: un fallo del SMTP no puede impedir que la
  postulación quede registrada. Mismo principio que la notificación de
  check-in en `003`.
- Reintento tras fallo de red: al no ser idempotente por diseño (ver
  `plan.md`), un reintento genuino del mismo visitante crea una segunda fila.
  Es un comportamiento aceptado explícitamente por el spec, no un defecto.

---

## Panel de administración de postulaciones (índice)

**Autorización:** rol `ADMIN` en las cuatro rutas. Controlador físicamente
separado del público — nunca la misma ruta que `POST /public/applications`
(Artículo V, ver `plan.md`).

| Ruta | Método | Qué hace | Modos de fallo principales |
|---|---|---|---|
| `/api/v1/applications` | `GET` | Lista paginada (`{ data, meta }`), filtro por `status`, texto libre. Cada fila incluye `submissionsFromSameEmail` (conteo de coincidencias por correo, normalizado sin distinguir mayúsculas) — satisface el caso límite de duplicados sin un endpoint aparte. `meta.total` se muestra aunque sea 0 (caso límite "nadie postula las primeras semanas"). | — |
| `/api/v1/applications/:id` | `GET` | Detalle completo, incluida `internalNotes`. | `404 NOT_FOUND` |
| `/api/v1/applications/:id` | `PATCH` | Cambia `status` (`ACCEPTED`\|`REJECTED`\|`NOT_TED_FORMAT`) y/o `internalNotes`. **Rechaza** `status: "CONVERTED"` — ese estado solo lo produce el endpoint de conversión. Registra `reviewedBy`/`reviewedAt`. Inserta en `audit_log`. | `422 INVALID_STATUS` (intento de fijar `CONVERTED` a mano), `409 INVALID_STATUS_TRANSITION` (p. ej. reabrir una ya `CONVERTED`) |
| `/api/v1/applications/:id/convert-to-speaker` | `POST` | RF-215: crea un `Speaker` en `DRAFT` con los campos mapeados (ver tabla de decisiones en `plan.md`), fija `converted_speaker_id` y `status: "CONVERTED"` en la misma transacción. Responde `201` con el speaker creado. | `404 NOT_FOUND`, `409 INVALID_STATUS_TRANSITION` (la postulación no está `ACCEPTED`) |
