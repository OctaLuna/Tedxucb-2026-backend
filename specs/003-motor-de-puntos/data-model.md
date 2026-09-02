# Modelo de datos: Motor de puntos y participación

**Feature:** `003-motor-de-puntos`
**Motor:** PostgreSQL 15+

Este documento contiene el detalle del esquema. Las entidades de identidad
(`users`, `student_profiles`, `careers`) pertenecen a `001` y aquí solo se
referencian.

---

## 1. Catálogo de actividades

```sql
CREATE TABLE activity_categories (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID REFERENCES activity_categories(id),
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  points_value      INTEGER NOT NULL CHECK (points_value > 0),
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  checkin_opens_at  TIMESTAMPTZ NOT NULL,
  checkin_closes_at TIMESTAMPTZ NOT NULL,
  -- Sin campo de cupo: las actividades no limitan asistentes (confirmado
  -- 2026-09-02 con el responsable del proyecto). Lo único que varía por
  -- actividad es cuánto otorga, nunca cuánta gente admite.
  allow_multiple_checkins BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_window   CHECK (ends_at > starts_at),
  CONSTRAINT valid_checkin  CHECK (checkin_closes_at > checkin_opens_at),
  CONSTRAINT valid_status   CHECK (status IN ('DRAFT','PUBLISHED','CLOSED','CANCELLED'))
);

CREATE INDEX idx_activities_status_date ON activities (status, starts_at DESC);
```

**RF-306** (cambiar el valor no recalcula lo ya otorgado) se garantiza por
diseño: `point_transactions.points` guarda el valor vigente al momento del
abono, no una referencia a `activities.points_value`.

## 2. Asignación de staff

```sql
CREATE TABLE activity_staff (
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);
```

Esta tabla es lo que consulta el guard de permisos en cada check-in. Cumple
RF-305 y el Artículo V.

## 3. Registro de participación

```sql
CREATE TABLE attendances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activities(id),
  student_id    UUID NOT NULL REFERENCES student_profiles(user_id),
  method        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'APPROVED',
  -- Copia de activities.allow_multiple_checkins al momento de insertar, no
  -- una referencia en vivo -- un índice único parcial no puede consultar
  -- otra tabla en su predicado. Mismo principio que ya usa este documento
  -- para RF-306 con points_value (corrección 2026-09-02: el índice de abajo
  -- ignoraba este campo y violaba RF-315 para actividades que sí admiten
  -- registros múltiples).
  multiple_allowed BOOLEAN NOT NULL DEFAULT false,
  validated_by  UUID REFERENCES users(id),
  note          TEXT,
  device_hash   TEXT,
  ip_address    INET,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'CLAIM' se elimina 2026-09-02: Historia 5 (reclamos) fue eliminada y
  -- ningún flujo lo produce (Artículo VII: no dejar código muerto en el
  -- CHECK). Si el canal de reclamos se reintroduce, se reabre con su propio
  -- ciclo de spec y ese ciclo agrega el valor de vuelta.
  CONSTRAINT valid_method CHECK (method IN ('STAFF_SCAN','MANUAL')),
  CONSTRAINT valid_status CHECK (status IN ('APPROVED','REJECTED')),
  CONSTRAINT manual_requires_note
    CHECK (method <> 'MANUAL' OR (note IS NOT NULL AND length(trim(note)) > 0))
);

-- RF-315: impide dos asistencias vivas del mismo alumno en la misma
-- actividad, EXCEPTO cuando la actividad admite registros múltiples.
CREATE UNIQUE INDEX one_attendance_per_activity
  ON attendances (activity_id, student_id)
  WHERE status <> 'REJECTED' AND NOT multiple_allowed;

CREATE INDEX idx_attendance_student ON attendances (student_id, checked_in_at DESC);
CREATE INDEX idx_attendance_device  ON attendances (device_hash, checked_in_at DESC);
```

`manual_requires_note` traslada RF-319 al motor de base de datos. Un registro
manual sin justificación es rechazado aunque el código de aplicación lo
permitiera por error.

El índice sobre `device_hash` sostiene la detección de anomalías de RF-322
(deuda técnica sin umbral fijo, ver spec.md — el índice ya soporta la
consulta manual del administrador aunque no exista todavía la alerta
automática).

## 4. Libro mayor de puntos

Núcleo del sistema. **Tabla de solo inserción: prohibidos `UPDATE` y `DELETE`.**

```sql
CREATE TABLE point_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES student_profiles(user_id),
  points          INTEGER NOT NULL,
  type            TEXT NOT NULL,
  activity_id     UUID REFERENCES activities(id),
  attendance_id   UUID UNIQUE REFERENCES attendances(id),
  reverses_id     UUID UNIQUE REFERENCES point_transactions(id),
  reason          TEXT,
  created_by      UUID REFERENCES users(id),
  idempotency_key TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT non_zero CHECK (points <> 0),
  CONSTRAINT valid_type
    CHECK (type IN ('ACTIVITY','BONUS','PENALTY','ADJUSTMENT','REVERSAL')),
  CONSTRAINT reversal_has_target
    CHECK (type <> 'REVERSAL' OR reverses_id IS NOT NULL),
  CONSTRAINT manual_types_need_reason
    CHECK (type NOT IN ('BONUS','PENALTY','ADJUSTMENT','REVERSAL')
           OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);

CREATE INDEX idx_points_student  ON point_transactions (student_id, created_at DESC);
CREATE INDEX idx_points_activity ON point_transactions (activity_id);
```

Puntos clave del diseño:

- **`idempotency_key` única** — cumple RF-317. Formato para check-in:
  `checkin:{activity_id}:{student_id}`. Un reintento tras caída de red choca
  contra la restricción única y no produce un segundo abono.
- **`reverses_id` única** — impide revertir dos veces el mismo movimiento, que
  restaría los puntos por duplicado.
- **`manual_types_need_reason`** — cumple RF-327 y el escenario 3 de la Historia
  4 a nivel de motor.
- **Inmutabilidad forzada** — se implementa con un trigger que rechaza `UPDATE`
  y `DELETE`, además de revocar esos privilegios al rol de aplicación. Depender
  solo de la disciplina del equipo no es una garantía.

```sql
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'point_transactions es de solo inserción (Artículo IV)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_point_transactions
  BEFORE UPDATE OR DELETE ON point_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
```

> **Nota (2026-09-02):** esta sección albergaba la tabla `point_claims`
> (reclamos). Se elimina completa junto con la Historia 5 del spec — ver
> ADR-008. Las secciones siguientes se renumeraron.

## 5. Caché de puntaje

Vive en `student_profiles` (feature `001`):

```sql
ALTER TABLE student_profiles
  ADD COLUMN total_points INTEGER NOT NULL DEFAULT 0
    CHECK (total_points >= 0);

CREATE INDEX idx_student_points ON student_profiles (total_points DESC);
```

`CHECK (total_points >= 0)` cumple RF-328 a nivel de motor.

**Invariante fundamental**, verificado a diario por el proceso de
reconciliación:

```sql
SELECT sp.user_id, sp.total_points,
       COALESCE(SUM(pt.points), 0) AS ledger_sum
FROM student_profiles sp
LEFT JOIN point_transactions pt ON pt.student_id = sp.user_id
GROUP BY sp.user_id, sp.total_points
HAVING sp.total_points <> COALESCE(SUM(pt.points), 0);
```

Este `SELECT` debe devolver cero filas siempre. Si devuelve alguna, hay un
incidente que investigar, no un número que corregir en silencio.

## 6. Ranking

Consulta de referencia para RF-338 y RF-339. El desempate usa la fecha del
movimiento más reciente: entre dos alumnos con igual puntaje, precede quien lo
alcanzó primero.

```sql
SELECT
  sp.user_id,
  u.full_name,
  c.name AS career,
  sp.total_points,
  RANK() OVER (
    ORDER BY sp.total_points DESC,
             (SELECT MAX(pt.created_at)
                FROM point_transactions pt
               WHERE pt.student_id = sp.user_id) ASC
  ) AS position
FROM student_profiles sp
JOIN users u ON u.id = sp.user_id
LEFT JOIN careers c ON c.id = sp.career_id
WHERE u.status = 'ACTIVE'
ORDER BY position;
```

## 7. Relaciones

```
activity_categories ──< activities ──< activity_staff >── users
                            │
                            ├──< attendances >── student_profiles
                            │        │
                            │        └──1:1── point_transactions
                            │
                            └──< point_transactions

point_transactions ──> point_transactions  (reverses_id, autorreferencia)
```

## 8. Datos semilla

Categorías de actividad: **desbloqueado desde 2026-08-30** (RF-310 resuelto,
RF-310a añade valor sugerido por categoría). No hay, a la fecha de este
diseño, ninguna lista real de categorías provista por el responsable del
proyecto. **No se siembran en producción** — mismo criterio que el catálogo
de facultades de prueba en `001` (marcadas `[PRUEBA]`) y la ausencia
deliberada de speakers sembrados en `002`: sembrar valores inventados
produciría pruebas que validan una escala ficticia. Las pruebas crean sus
propias categorías vía un helper de prueba, nunca del seed de producción.
