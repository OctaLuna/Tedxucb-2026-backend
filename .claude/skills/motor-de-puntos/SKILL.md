---
name: motor-de-puntos
description: Reglas e invariantes del sistema de puntos del TEDxUCB — libro mayor de solo inserción, idempotencia, check-in transaccional, reversiones y ranking. Úsala SIEMPRE que el trabajo toque puntos, check-in, escaneo de QR, asistencias, reclamos, ranking, asignación de cupos o cualquier cosa que altere el puntaje de un alumno, aunque el pedido parezca menor ("solo un endpoint de consulta", "un ajuste rápido", "arreglar este bug del contador"). También cuando revises código ajeno que toque estas áreas. Ante la duda de si aplica, aplícala: un error aquí decide injustamente quién entra al evento.
---

# Motor de puntos — TEDxUCB

## Por qué esto importa más que el resto del sistema

El auditorio tiene cupos limitados y hay más alumnos que butacas. Los puntos
deciden quién entra. Un punto duplicado, perdido o mal otorgado no es un bug de
contabilidad: es un alumno que se queda afuera injustamente y una organización
que no puede explicar por qué.

El sistema no aspira a no tener errores. Aspira a que **todo error sea
detectable, explicable y corregible sin destruir la evidencia**. Esa es la
diferencia entre un ranking discutible y un ranking ilegítimo.

Cuando una regla de abajo te parezca excesiva para el tamaño del proyecto,
relee este párrafo.

## Los cinco invariantes

Si un cambio rompe cualquiera de estos, está mal, por más que las pruebas pasen.

### 1. El puntaje es siempre la suma del libro mayor

`student_profiles.total_points` es **caché derivada**, nunca fuente de verdad.
La verdad vive en `point_transactions`. Debe poder reconstruirse desde cero en
cualquier momento.

```sql
-- Esta consulta debe devolver CERO filas, siempre
SELECT sp.user_id FROM student_profiles sp
LEFT JOIN point_transactions pt ON pt.student_id = sp.user_id
GROUP BY sp.user_id, sp.total_points
HAVING sp.total_points <> COALESCE(SUM(pt.points), 0);
```

Si devuelve filas, hay un incidente que investigar, no un número que arreglar en
silencio.

### 2. El libro mayor es de solo inserción

Prohibidos `UPDATE` y `DELETE` sobre `point_transactions`. Hay un trigger que los
rechaza y privilegios revocados al rol de aplicación, porque la disciplina del
equipo no es una garantía.

Los errores se corrigen insertando una transacción `REVERSAL` que apunta a la
original con `reverses_id`. Ambas quedan visibles en el historial del alumno.

**Por qué:** editar destruye la evidencia justo cuando más se necesita, que es
durante un reclamo. Un alumno que ve su puntaje bajar sin explicación pierde la
confianza en todo el proceso.

### 3. Toda operación de puntos es idempotente

Reintentar con la misma clave no produce un segundo efecto. La clave va en
`idempotency_key`, con restricción única en base de datos.

Formato para check-in: `checkin:{activity_id}:{student_id}`.

**La deriva el servidor, nunca el cliente.** Si el cliente la elige, puede eludir
la protección enviando una distinta en cada reintento.

**Por qué:** la red del campus va a fallar durante las actividades. El staff va a
reintentar. Sin idempotencia, eso son puntos duplicados.

### 4. El check-in es atómico

Registro de asistencia, movimiento de puntos y actualización de la caché ocurren
en **una sola transacción**. Nunca puede quedar una asistencia sin sus puntos ni
puntos sin asistencia.

Orden obligatorio:

```
1. Validar token QR (firma + vigencia)
2. Verificar asignación del staff a la actividad
3. Verificar estado PUBLISHED y ventana de check-in
4. INSERT attendances  → conflicto con índice único = 409 con el registro previo
5. INSERT point_transactions con idempotency_key
   → conflicto = la operación ya ocurrió: devolver 200 con el resultado previo,
     NO un error
6. SELECT ... FOR UPDATE sobre el alumno + UPDATE de total_points
7. COMMIT
8. Encolar notificación (FUERA de la transacción)
```

El paso 8 va fuera a propósito: una caída del servicio de correo no puede
impedir que un alumno reciba sus puntos.

### 5. Las garantías viven en la base de datos, no en el código

Verificar antes de insertar tiene una condición de carrera: dos escaneos
simultáneos pasan ambos. El índice único no.

Restricciones que deben existir en el esquema y no solo en el servicio:

| Restricción | Qué impide |
|---|---|
| Índice único parcial en `attendances` | Doble asistencia viva del mismo alumno en la misma actividad |
| `idempotency_key` única | Doble abono por reintento |
| `reverses_id` única | Revertir dos veces el mismo movimiento |
| `CHECK (total_points >= 0)` | Puntaje negativo |
| `CHECK (points <> 0)` | Movimientos vacíos |
| `manual_requires_note` | Registro manual sin justificación |
| `manual_types_need_reason` | Ajuste, bono o penalización sin motivo |
| Trigger anti-mutación | `UPDATE` o `DELETE` sobre el libro mayor |

## Al escribir código nuevo

**Antes de tocar puntos, lee** `specs/003-motor-de-puntos/spec.md` y
`contracts/`. Si lo que vas a hacer no está en un contrato, no lo escribas
todavía: vuelve a la fase Plan.

- Ningún servicio fuera del módulo `points` escribe en `total_points`.
- Los tipos de movimiento son `ACTIVITY`, `BONUS`, `PENALTY`, `ADJUSTMENT`,
  `REVERSAL`. No inventes uno nuevo sin actualizar la spec.
- Todo movimiento manual lleva motivo. Sin motivo, se rechaza.
- Una penalización mayor que el saldo trunca a cero y lo informa; no falla.
- El desempate del ranking es determinista: precede quien alcanzó el puntaje
  primero. Con cupos escasos, un empate en el límite es casi seguro.

## Modos de fallo del check-in

Cada uno necesita su propio mensaje. Un error genérico es inaceptable: el staff
está en un pasillo con una fila esperando y debe entender en un vistazo si el
problema es el token, la hora o un registro que ya existía.

| Código | Error | Cuándo |
|---|---|---|
| 400 | `INVALID_QR_TOKEN` | Firma inválida |
| 401 | `EXPIRED_QR_TOKEN` | Token vencido |
| 403 | `STAFF_NOT_ASSIGNED` | Validador sin asignación a la actividad |
| 409 | `CHECKIN_WINDOW_CLOSED` | Fuera de ventana o actividad no publicada |
| 409 | `ALREADY_CHECKED_IN` | Ya registrado. Incluye hora y validador previos |

## Anti-fraude

El riesgo aquí no es técnico sino social: con cupos disputados, habrá intentos.

- El **staff escanea al alumno**, no al revés. Así el dispositivo que otorga
  puntos es el autenticado, y queda registrado quién validó a quién.
- El token del alumno **rota y caduca en segundos**. Una captura de pantalla
  compartida por WhatsApp llega vencida.
- La validez se verifica **en el servidor**. Nunca confíes en el cliente.
- El registro manual queda **marcado** y con justificación. Si supera el 5% del
  total, el mecanismo principal no está funcionando en campo.
- Se registran `device_hash` e `ip_address` para detectar anomalías.

## Al revisar código

Preguntas que hacerse ante cualquier cambio que roce los puntos:

- ¿Puede este camino escribir `total_points` sin pasar por el libro mayor?
- ¿Qué pasa si esta petición llega dos veces?
- ¿Qué pasa si dos peticiones llegan a la vez para el mismo alumno?
- ¿Este error deja una asistencia sin su movimiento de puntos?
- ¿Un alumno podría ver su puntaje cambiar sin encontrar la explicación en su
  historial?
- ¿Esta protección está en el código o en el esquema? Si está solo en el código,
  tiene una condición de carrera.

## Referencias

- `references/invariantes.md` — checklist ejecutable para revisiones
- `specs/003-motor-de-puntos/data-model.md` — esquema completo
- `specs/003-motor-de-puntos/contracts/checkin.md` — contrato del check-in
- `specs/003-motor-de-puntos/quickstart.md` — 14 escenarios de validación manual
- `memory/constitution.md` — Artículo IV, del que sale todo lo anterior
