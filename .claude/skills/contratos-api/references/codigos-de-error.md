# Catálogo de códigos de error

Registro único de los códigos `error` de la API. Antes de inventar uno nuevo,
busca aquí: dos códigos para la misma situación obligan al frontend a manejar
ambos para siempre.

Al añadir uno, agrégalo a esta tabla en el mismo commit.

## Autenticación e identidad

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Correo o contraseña incorrectos |
| `ACCOUNT_DISABLED` | 403 | Cuenta deshabilitada por el administrador |
| `ACCOUNT_PENDING_VERIFICATION` | 403 | Registro sin verificar; no puede acumular puntos |
| `EMAIL_ALREADY_REGISTERED` | 409 | Correo ya en uso |
| `STUDENT_CODE_ALREADY_REGISTERED` | 409 | Código de registro ya en uso |
| `EMAIL_DOMAIN_NOT_ALLOWED` | 422 | Correo fuera del dominio institucional |
| `STUDENT_CODE_NOT_IN_ROSTER` | 422 | Código no figura en el padrón |
| `INVITATION_EXPIRED` | 410 | Invitación vencida |
| `INVITATION_ALREADY_USED` | 409 | Invitación ya utilizada |
| `LAST_ADMIN` | 409 | No se puede dejar el sistema sin administrador |

## Check-in

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_QR_TOKEN` | 400 | Firma inválida o token malformado |
| `EXPIRED_QR_TOKEN` | 401 | Token vencido |
| `STAFF_NOT_ASSIGNED` | 403 | El validador no está asignado a la actividad |
| `CHECKIN_WINDOW_CLOSED` | 409 | Fuera de ventana o actividad no publicada |
| `ALREADY_CHECKED_IN` | 409 | Asistencia viva ya existente |
| `ACTIVITY_FULL` | 422 | Cupo de la actividad agotado |
| `NOTE_REQUIRED` | 400 | Registro manual sin justificación |

## Puntos

| Código | HTTP | Significado |
|---|---|---|
| `REASON_REQUIRED` | 400 | Ajuste sin motivo |
| `ZERO_POINTS` | 400 | Movimiento de cero puntos |
| `ALREADY_REVERSED` | 409 | Ese movimiento ya fue revertido |
| `CANNOT_REVERSE_REVERSAL` | 422 | No se revierte una reversión |

## Reclamos

| Código | HTTP | Significado |
|---|---|---|
| `CLAIM_ALREADY_OPEN` | 409 | Ya hay un reclamo abierto para esa actividad |
| `ALREADY_HAS_POINTS` | 409 | El alumno ya tiene puntos por esa actividad |
| `CLAIMS_CLOSED` | 410 | Plazo de reclamos vencido |

## Actividades

| Código | HTTP | Significado |
|---|---|---|
| `ACTIVITY_HAS_ATTENDANCES` | 409 | No se puede eliminar; solo cancelar |
| `INVALID_STATUS_TRANSITION` | 422 | Cambio de estado no permitido |

## Cupos

| Código | HTTP | Significado |
|---|---|---|
| `ALLOCATION_ALREADY_RUN` | 409 | La asignación ya se ejecutó; revertir primero |
| `SEAT_DEADLINE_PASSED` | 410 | Plazo de confirmación vencido |
| `TICKET_ALREADY_USED` | 409 | Entrada ya utilizada. Incluye hora del primer ingreso |
| `TICKET_NOT_FOUND` | 404 | Entrada inexistente |
| `CAPACITY_EXCEEDED` | 422 | La asignación excedería el aforo |

## Generales

| Código | HTTP | Significado |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Validación de forma. `details` lleva los campos |
| `FORBIDDEN` | 403 | Sin permiso |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `RATE_LIMITED` | 429 | Límite de frecuencia superado |
| `INTERNAL_ERROR` | 500 | Fallo no controlado. Nunca expone detalles internos |
