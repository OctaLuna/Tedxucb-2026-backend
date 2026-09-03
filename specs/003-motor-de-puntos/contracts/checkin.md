# Contrato: Check-in de participación

**Feature:** `003-motor-de-puntos`
**Requisitos que satisface:** RF-305, RF-311 a RF-321
**Criticidad:** máxima. Es la operación que genera todos los datos del sistema.

> Este contrato se escribe **antes** que la implementación (Artículo IX). Las
> pruebas de contrato derivadas de este documento deben fallar antes de existir
> una sola línea del servicio.

---

## `POST /api/v1/activities/{activityId}/checkin`

Registra la participación de un alumno y le otorga los puntos de la actividad,
en una sola operación indivisible.

**Autorización:** rol `STAFF` o `ADMIN`, **y además** estar asignado a
`activityId`. La pertenencia al rol no basta: se verifica contra la asignación
explícita (Artículo V).

### Petición

```json
{
  "qrToken": "eyJzdHVkZW50SWQiOiI...",
  "deviceHash": "a3f5c9e2b1d4"
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `qrToken` | string | sí | Token firmado extraído del código del alumno. |
| `deviceHash` | string | no | Identificador estable del dispositivo del staff, para detección de anomalías (RF-321). |

La clave de idempotencia **no** la envía el cliente: el servidor la deriva de
`checkin:{activityId}:{studentId}` una vez validado el token. Dejar que el
cliente la elija permitiría eludir la protección enviando una distinta en cada
reintento.

### Respuesta exitosa — `201 Created`

```json
{
  "attendanceId": "8f2e1c...",
  "student": {
    "id": "b41d9a...",
    "fullName": "María Fernanda Quispe Aliaga",
    "studentCode": "202012345",
    "avatarUrl": "https://.../avatar.jpg",
    "career": "Ingeniería Industrial"
  },
  "pointsAwarded": 10,
  "newTotal": 45,
  "activity": { "id": "3c7a...", "title": "Taller de Economía Circular" },
  "checkedInAt": "2026-09-15T19:32:04Z"
}
```

La respuesta incluye nombre, código y fotografía porque el staff necesita
confirmar visualmente que registró a la persona correcta, con una fila
esperando (RF-318, Artículo VI). El código de registro va siempre junto al
nombre: en una universidad hay homónimos.

### Modos de fallo

Los seis casos son parte del contrato y cada uno necesita su prueba. Un mensaje
genérico de error es inaceptable: el staff está en un pasillo y debe saber en un
vistazo si el problema es el token, la hora o un duplicado.

| Código | `error` | Cuándo | Requisito |
|---|---|---|---|
| `400` | `INVALID_QR_TOKEN` | Firma inválida o token malformado. | RF-313 |
| `401` | `EXPIRED_QR_TOKEN` | Token vencido. Incluye `expiredAt`. | RF-312 |
| `403` | `STAFF_NOT_ASSIGNED` | El validador no está asignado a la actividad. | RF-305 |
| `403` | `STUDENT_NOT_VERIFIED` | La cuenta del alumno escaneado no está activa/verificada todavía. | RF-122 (`001`) |
| `409` | `CHECKIN_WINDOW_CLOSED` | Fuera de la ventana, o actividad no publicada. Incluye `opensAt` y `closesAt`. | RF-316 |
| `409` | `ALREADY_CHECKED_IN` | El alumno ya tiene asistencia viva. Incluye `checkedInAt` y `pointsAwarded` del registro previo. | RF-315 |

`ACTIVITY_FULL` se elimina del contrato **(resuelto 2026-09-02)**: las
actividades no tienen límite de asistentes (confirmado con el responsable
del proyecto — el campo `capacity` no existe en el modelo). `STUDENT_NOT_VERIFIED`
se añade: es el caso que ya anticipaba `tasks.md` (T068, derivado de RF-122
de `001`) y que no estaba en la tabla original.

Ejemplo de duplicado, que es el fallo más frecuente en campo:

```json
{
  "statusCode": 409,
  "error": "ALREADY_CHECKED_IN",
  "message": "Este alumno ya fue registrado en esta actividad.",
  "details": {
    "checkedInAt": "2026-09-15T19:28:11Z",
    "pointsAwarded": 10,
    "validatedBy": "Carlos Mendoza"
  }
}
```

### Garantías transaccionales

Todo lo siguiente ocurre dentro de una única transacción de base de datos:

1. Verificar firma y vigencia del token.
2. Verificar asignación del staff a la actividad.
3. Verificar estado `PUBLISHED` y ventana de check-in abierta.
4. Insertar en `attendances` → si viola el índice único parcial, abortar con
   `409 ALREADY_CHECKED_IN` devolviendo el registro existente.
5. Insertar en `point_transactions` con la clave de idempotencia derivada
   (`checkin:{activityId}:{studentId}`).
6. Bloquear la fila del alumno (`SELECT ... FOR UPDATE`) y actualizar su caché
   de puntaje.
7. Confirmar.

**Corrección 2026-09-02 (auditoría T101, este paso 5 había quedado
desactualizado respecto a la sección "Idempotencia" de abajo):** el paso 5
en la práctica nunca dispara su propio conflicto — el orden de inserción
(asistencia antes que movimiento de puntos) hace que el índice único
parcial del paso 4 siempre viole primero ante un reintento. No existe un
camino real donde `point_transactions` sea el primero en rechazar la
petición, así que no hay una rama de `200` que implementar: todo repetido
llega como `409 ALREADY_CHECKED_IN` desde el paso 4. Ver el detalle
completo en "Idempotencia — comportamiento exigido".

La notificación al alumno se encola **después** de confirmar, nunca dentro de la
transacción: un fallo del servicio de correo no puede impedir que un alumno
reciba sus puntos.

**Invariante:** al terminar, o existen tanto la asistencia como su movimiento de
puntos, o no existe ninguno de los dos. Nunca uno solo.

### Idempotencia — comportamiento exigido

| Escenario | Resultado esperado |
|---|---|
| Primera petición | `201`, puntos otorgados una vez |
| Reintento (secuencial o concurrente) para el mismo alumno y actividad | `409 ALREADY_CHECKED_IN` con los datos del registro previo (`checkedInAt`, `pointsAwarded`, `validatedBy`). **Nunca** un segundo abono de puntos. |
| Alumno distinto, misma actividad | `201` normal |

**Nota sobre el reintento (aclarado 2026-09-02, no depende de las decisiones
del Grupo 0):** el índice único parcial de `attendances` no puede distinguir
"esta es mi propia petición reenviada tras perder la red" de "otro miembro
del staff escaneó al mismo alumno un segundo después" — ambas violan el mismo
índice de la misma forma, y el orden ya fijado de este contrato (asistencia
antes que movimiento de puntos) hace que ese conflicto dispare siempre
primero. La garantía real que exige RF-317 (nunca un segundo abono) se
cumple igual con `409`: la respuesta ya trae `checkedInAt`+`validatedBy` del
registro previo (RF-318, Artículo VI) precisamente para que el staff que
reconozca su propio nombre y una hora reciente lo trate como éxito en la
interfaz. Es una decisión de UX del cliente de escaneo, no del backend.

La prueba de concurrencia (dos peticiones verdaderamente simultáneas, una
`201` y otra `409`, nunca dos `201`) solo puede probarse con base de datos
real. Es la razón por la que el Artículo IX prohíbe mockear aquí.

---

## `POST /api/v1/activities/{activityId}/checkin/manual`

Alternativa para cuando el dispositivo del alumno falla (RF-319).

**Autorización:** idéntica al check-in por escaneo.

```json
{
  "studentId": "b41d9a...",
  "note": "El alumno se quedó sin batería; verificado con su carnet universitario."
}
```

`note` es obligatoria y no puede estar vacía ni ser solo espacios. La
restricción vive también en la base de datos (`manual_requires_note`), de modo
que un descuido en el código de aplicación no la eluda.

La asistencia resultante lleva `method: "MANUAL"` y aparece marcada como tal en
el historial del alumno y en la auditoría. Se mide su proporción: más de un 5%
de registros manuales significa que el mecanismo principal no está funcionando
en campo (CE-304).

Respuestas y garantías transaccionales: idénticas al check-in por escaneo,
salvo que no hay validación de token.

---

## `GET /api/v1/me/qr`

Devuelve el token rotativo del alumno (RF-311, RF-312).

**Autorización:** rol `ALUMNO`, sobre su propio perfil exclusivamente.

```json
{
  "token": "eyJzdHVkZW50SWQiOiI...",
  "expiresAt": "2026-09-15T19:33:04Z",
  "refreshInSeconds": 45
}
```

El cliente renueva antes de `expiresAt` para que el código nunca aparezca
vencido en pantalla. La vigencia es corta y deliberada: una captura de pantalla
compartida caduca antes de poder circular.

**Resuelto 2026-09-02:** 60 segundos, confirmado (era la sugerencia de
partida del contrato).

### Prueba de contrato obligatoria

Un token obtenido y usado después de su vencimiento debe ser rechazado con
`401 EXPIRED_QR_TOKEN`. Es la defensa central del sistema anti-fraude
(Historia 6) y su prueba no es opcional.
