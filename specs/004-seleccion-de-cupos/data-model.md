# Modelo de datos: Selección de asistentes y control de acceso

**Feature:** `004-seleccion-de-cupos`
**Motor:** PostgreSQL 15+

Tras ADR-009 (2026-09-03): sin máquina de estados de invitación, sin lista
de espera. `events` (`002`) y `student_profiles`/`point_transactions`
(`001`/`003`) se referencian, no se redefinen aquí.

---

## 1. Aforo del evento (ampliación de `events`, no una tabla nueva)

```sql
-- events.capacity ya existe desde 002-b, sin usar hasta ahora (aforo total).
-- Le falta el desglose estudiantil (RF-401).
ALTER TABLE events
  ADD COLUMN student_capacity INTEGER;

ALTER TABLE events
  ADD CONSTRAINT student_capacity_positive CHECK (student_capacity IS NULL OR student_capacity > 0),
  ADD CONSTRAINT student_capacity_within_total
    CHECK (student_capacity IS NULL OR capacity IS NULL OR student_capacity <= capacity);
```

Ambos nullable hasta que el administrador los configure — mismo criterio
que ya usan otros campos opcionales de `events` (`venue`, `tagline`).

## 2. Ejecución de la selección

```sql
CREATE TABLE selection_runs (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                   UUID NOT NULL REFERENCES events(id),
  executed_by                UUID NOT NULL REFERENCES users(id),
  student_capacity_snapshot  INTEGER NOT NULL,
  executed_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_by                UUID REFERENCES users(id),
  reverted_at                TIMESTAMPTZ,
  revert_reason              TEXT,
  CONSTRAINT snapshot_positive CHECK (student_capacity_snapshot > 0),
  CONSTRAINT revert_needs_reason
    CHECK (reverted_at IS NULL OR (revert_reason IS NOT NULL AND length(trim(revert_reason)) > 0))
);

-- RF-408: no se puede ejecutar dos veces sobre el mismo evento sin
-- revertir la anterior -- mismo lenguaje que ya usa one_published_event
-- de 002 para "una fila viva a la vez".
CREATE UNIQUE INDEX one_active_selection_run_per_event
  ON selection_runs (event_id)
  WHERE reverted_at IS NULL;
```

`student_capacity_snapshot` congela el aforo vigente en el momento de
ejecutar (RF-401a: cambiar el aforo después exige revertir primero, nunca
en silencio).

## 3. Selección (una fila por persona) y su entrada

```sql
CREATE TABLE selections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: una asignación manual (Historia 4) puede resolverse en
  -- cualquier momento, incluso antes de que exista una ejecución por
  -- ranking -- no toda selección pertenece a un run.
  run_id              UUID REFERENCES selection_runs(id),
  source              TEXT NOT NULL,
  student_id          UUID REFERENCES student_profiles(user_id),
  audience_type       TEXT NOT NULL DEFAULT 'ESTUDIANTE',
  full_name           TEXT,
  email               TEXT,
  -- Puntaje y posición congelados en el instante de la selección (RF-404) --
  -- nunca referenciados en vivo, mismo principio que ya usa points_value
  -- en point_transactions (003) para RF-306.
  points_at_selection INTEGER,
  rank_at_selection   INTEGER,
  assigned_by         UUID REFERENCES users(id),
  reason              TEXT,
  -- Entrada (RF-416/RF-417): 1:1 con la selección, se genera en el mismo
  -- paso -- no hay razón de negocio para separarla en su propia tabla
  -- (Artículo VIII). En claro, NO hasheado -- corrección 2026-09-03,
  -- 004-b: a diferencia de auth_tokens.token_hash (001), Historia 2
  -- escenario 2 exige que el alumno pueda volver a ver su entrada en
  -- cualquier momento vía GET /me/entry, no solo desde el correo inicial
  -- -- imposible si solo se guarda el hash de una sola vía. Menor riesgo
  -- que un token de sesión: una entrada filtrada permite un solo ingreso
  -- indebido y acotado, no una toma de cuenta persistente. Sigue siendo
  -- aleatoria de alta entropía (generateOpaqueToken(), 32 bytes).
  entry_code          TEXT NOT NULL UNIQUE,
  entry_used_at       TIMESTAMPTZ,
  entry_validated_by  UUID REFERENCES users(id),
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES users(id),
  revoked_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_source CHECK (source IN ('RANKING', 'MANUAL')),
  CONSTRAINT ranking_has_run CHECK (source <> 'RANKING' OR run_id IS NOT NULL),
  CONSTRAINT ranking_has_snapshot
    CHECK (source <> 'RANKING'
           OR (student_id IS NOT NULL AND points_at_selection IS NOT NULL AND rank_at_selection IS NOT NULL)),
  CONSTRAINT manual_needs_reason
    CHECK (source <> 'MANUAL'
           OR (assigned_by IS NOT NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)),
  CONSTRAINT contact_present
    CHECK (student_id IS NOT NULL OR (full_name IS NOT NULL AND email IS NOT NULL)),
  CONSTRAINT revoked_needs_reason
    CHECK (revoked_at IS NULL OR (revoked_reason IS NOT NULL AND length(trim(revoked_reason)) > 0))
);

-- Un alumno no puede tener dos selecciones vivas a la vez (protege contra
-- una asignación manual duplicando a alguien que ya entró por ranking, o
-- contra reintentos de la ejecución).
CREATE UNIQUE INDEX one_active_selection_per_student
  ON selections (student_id)
  WHERE revoked_at IS NULL AND student_id IS NOT NULL;

CREATE INDEX idx_selections_run ON selections (run_id);
CREATE INDEX idx_selections_active ON selections (revoked_at) WHERE revoked_at IS NULL;
```

`source = 'RANKING'` son las plazas estudiantiles resueltas automáticamente
al ejecutar, siempre con `run_id`. `source = 'MANUAL'` cubre tanto RF-420
(lugares no estudiantiles, que Historia 4 dice explícitamente que "puede
resolverse en cualquier momento", sin depender de que exista una ejecución
por ranking) como el caso límite de cubrir a mano un lugar liberado —
ADR-009 las trata como la misma operación (asignación manual auditada,
`assigned_by`+`reason` obligatorios). `run_id` queda `NULL` en una
asignación manual que no está cubriendo un lugar de ningún `run` en
particular.

`revoked_at` es **individual** (un seleccionado se deshabilita, no
asiste, o el admin decide liberar su lugar) — distinto de
`selection_runs.reverted_at`, que deshace **toda** una ejecución de una
vez. Revertir un `run` marca `revoked_at` en cascada sobre todas sus
`selections` vivas, dentro de la misma transacción (Artículo IV en
espíritu: nunca se borra la fila, se marca).

## 4. Escaneo en la puerta

Sin tabla nueva: `entry_used_at`/`entry_validated_by` en `selections` ya lo
cubren. El escaneo es un `UPDATE ... WHERE entry_code = $1 AND
entry_used_at IS NULL` condicionado (mismo patrón que
`applications.service.ts` de `002` ya usa para una actualización
condicionada) — si afecta cero filas, ya estaba usada o el código no
existe; el motor decide, no una lectura previa con condición de carrera.

## 5. Relaciones

```
events ──< selection_runs ──< selections >── student_profiles (opcional)
                                   │
                                   └── entry_code / entry_used_at (la "entrada", en la misma fila)
```

## 6. Datos semilla

Ninguno. `events.student_capacity` lo configura el administrador junto con
el resto de los datos del evento (`002`), no se siembra un valor
inventado — mismo criterio que ya se aplicó con las categorías de
actividad de `003` y el catálogo de facultades de `001`.
