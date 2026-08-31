# Checklist de invariantes — motor de puntos

Ejecuta esto antes de aprobar cualquier cambio que toque puntos, asistencias,
check-in, reclamos o ranking.

## Índice

1. [Integridad del libro mayor](#1-integridad-del-libro-mayor)
2. [Idempotencia](#2-idempotencia)
3. [Atomicidad](#3-atomicidad)
4. [Concurrencia](#4-concurrencia)
5. [Trazabilidad](#5-trazabilidad)
6. [Permisos](#6-permisos)
7. [Consultas de verificación](#7-consultas-de-verificación)

---

## 1. Integridad del libro mayor

- [ ] Ningún `UPDATE` ni `DELETE` sobre `point_transactions` en todo el código
- [ ] El trigger anti-mutación existe y está activo
- [ ] El rol de aplicación no tiene privilegios de `UPDATE`/`DELETE` sobre esa tabla
- [ ] Solo el módulo `points` escribe en `total_points`
- [ ] Las correcciones son inserciones de tipo `REVERSAL`, nunca ediciones
- [ ] `total_points` puede reconstruirse desde el libro mayor

## 2. Idempotencia

- [ ] Toda operación que otorga puntos lleva `idempotency_key`
- [ ] La clave la **deriva el servidor**, no llega del cliente
- [ ] El conflicto de clave devuelve `200` con el resultado previo, no un error
- [ ] Existe prueba de que un reintento no duplica puntos

## 3. Atomicidad

- [ ] Asistencia, movimiento de puntos y caché se escriben en una sola transacción
- [ ] La notificación se encola **después** del commit
- [ ] Ningún camino de error deja una asistencia sin su movimiento, o al revés
- [ ] Existe prueba del invariante contra base de datos real

## 4. Concurrencia

- [ ] El puntaje se actualiza con `SELECT ... FOR UPDATE`
- [ ] La protección contra duplicados está en el índice único, no en un `SELECT` previo
- [ ] Existe prueba con dos peticiones **verdaderamente simultáneas**
- [ ] Solo una prospera; la otra devuelve `409`

## 5. Trazabilidad

- [ ] Todo movimiento manual lleva motivo no vacío
- [ ] Todo movimiento registra su autor, salvo los automáticos
- [ ] El historial del alumno muestra original y reversión, ambos con su motivo
- [ ] El registro manual aparece identificado como tal
- [ ] Un movimiento originado en un reclamo se distingue de uno normal
- [ ] Las acciones sensibles quedan en auditoría

## 6. Permisos

- [ ] El staff solo valida donde está asignado, verificado contra `activity_staff`
- [ ] El staff no puede ajustar puntos fuera del check-in
- [ ] El staff no accede al ranking global ni al padrón
- [ ] El alumno solo ve su propio historial
- [ ] Las cuentas pendientes de verificación no acumulan puntos

## 7. Consultas de verificación

**Descuadre entre caché y libro mayor** — debe devolver cero filas:

```sql
SELECT sp.user_id, sp.total_points, COALESCE(SUM(pt.points), 0) AS ledger_sum
FROM student_profiles sp
LEFT JOIN point_transactions pt ON pt.student_id = sp.user_id
GROUP BY sp.user_id, sp.total_points
HAVING sp.total_points <> COALESCE(SUM(pt.points), 0);
```

**Asistencias sin movimiento de puntos** — debe devolver cero filas:

```sql
SELECT a.id FROM attendances a
LEFT JOIN point_transactions pt ON pt.attendance_id = a.id
WHERE a.status = 'APPROVED' AND pt.id IS NULL;
```

**Movimientos manuales sin motivo** — debe devolver cero filas:

```sql
SELECT id FROM point_transactions
WHERE type IN ('BONUS','PENALTY','ADJUSTMENT','REVERSAL')
  AND (reason IS NULL OR length(trim(reason)) = 0);
```

**Reversiones duplicadas** — debe devolver cero filas:

```sql
SELECT reverses_id FROM point_transactions
WHERE reverses_id IS NOT NULL
GROUP BY reverses_id HAVING COUNT(*) > 1;
```

**Proporción de registros manuales** — por encima del 5% indica que el mecanismo
principal no funciona en campo:

```sql
SELECT method, COUNT(*), ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM attendances WHERE status = 'APPROVED' GROUP BY method;
```

## Antes de la primera actividad real

- [ ] Ejecutado el escenario 14 de `quickstart.md` **en campo**: 20 alumnos, dos
      dispositivos, red del campus, teléfonos de gama media
- [ ] Verificado que cada registro se completa en menos de 5 segundos
- [ ] Reconciliación diaria programada y con alerta configurada
- [ ] `points-cli reconcile` funciona en producción

Un sistema correcto que hace esperar veinte minutos a una fila termina
reemplazado por registros manuales, y con ellos se pierde toda la trazabilidad.
