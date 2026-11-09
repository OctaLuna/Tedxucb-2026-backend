-- Connect each operational points activity to its schedule item. This keeps
-- the published program and the points configuration as two views of the
-- same activity without rewriting either source.
ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "program_item_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "activities_program_item_id_key"
  ON "activities"("program_item_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_program_item_id_fkey'
      AND conrelid = 'activities'::regclass
  ) THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_program_item_id_fkey"
      FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM activities a
    JOIN event_program_items p ON p.event_id = a.event_id
      AND lower(trim(p.title)) = lower(trim(a.title))
    GROUP BY a.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede vincular automáticamente: hay títulos de cronograma duplicados para una actividad.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM activities a
    JOIN event_program_items p ON p.event_id = a.event_id
      AND lower(trim(p.title)) = lower(trim(a.title))
    WHERE a.program_item_id IS NOT NULL AND a.program_item_id <> p.id
  ) THEN
    RAISE EXCEPTION 'No se puede vincular automáticamente: una actividad ya apunta a otro elemento del cronograma.';
  END IF;
END $$;

UPDATE activities a
SET program_item_id = p.id
FROM event_program_items p
WHERE a.program_item_id IS NULL
  AND p.event_id = a.event_id
  AND lower(trim(p.title)) = lower(trim(a.title));

-- Give the append-only ledger a direct, unique reference to NFC/schedule
-- attendance rows. Existing operational attendances keep using attendance_id.
ALTER TABLE "point_transactions"
  ADD COLUMN IF NOT EXISTS "program_attendance_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "point_transactions_program_attendance_id_key"
  ON "point_transactions"("program_attendance_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'point_transactions_program_attendance_id_fkey'
      AND conrelid = 'point_transactions'::regclass
  ) THEN
    ALTER TABLE "point_transactions"
      ADD CONSTRAINT "point_transactions_program_attendance_id_fkey"
      FOREIGN KEY ("program_attendance_id") REFERENCES "program_attendances"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Award historical Innovation Week NFC attendance only when the schedule
-- item has exactly one linked, positively scored activity and the attendee
-- has not already earned activity points through the operational check-in.
-- Matching titles are case/outer-space insensitive; the link is persisted so
-- subsequent requests never need to infer an activity from its title.
DO $$
DECLARE innovation_event_id UUID;
BEGIN
  SELECT id INTO innovation_event_id FROM events WHERE slug = 'innovation-week';
  IF innovation_event_id IS NOT NULL THEN
    PERFORM set_config('ted.event_id', innovation_event_id::text, true);

    INSERT INTO point_transactions (
      student_id, points, type, activity_id, program_attendance_id,
      reason, idempotency_key, created_at
    )
    SELECT pa.user_id, a.points_value, 'ACTIVITY', a.id, pa.id,
      'Puntaje retroactivo por asistencia confirmada al cronograma de Innovation Week',
      'checkin:' || a.id::text || ':' || pa.user_id::text,
      pa.checked_in_at
    FROM program_attendances pa
    JOIN event_program_items p ON p.id = pa.program_item_id
    JOIN activities a ON a.program_item_id = p.id
    WHERE p.event_id = innovation_event_id
      AND a.points_value > 0
      AND NOT EXISTS (
        SELECT 1 FROM point_transactions existing
        WHERE existing.program_attendance_id = pa.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM point_transactions existing
        WHERE existing.student_id = pa.user_id
          AND existing.activity_id = a.id
          AND existing.type = 'ACTIVITY'
      );
  END IF;
END $$;

-- Rebuild the derived event totals from the immutable ledger in chronological
-- order, preserving the existing floor-at-zero semantics.
DO $$
DECLARE innovation_event_id UUID;
BEGIN
  SELECT id INTO innovation_event_id FROM events WHERE slug = 'innovation-week';
  IF innovation_event_id IS NOT NULL THEN
    WITH running AS (
      SELECT ownership.event_id, pt.student_id, pt.id, pt.created_at,
        GREATEST(0, SUM(pt.points) OVER (
          PARTITION BY ownership.event_id, pt.student_id
          ORDER BY pt.created_at, pt.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ))::integer AS total_points
      FROM point_transactions pt
      JOIN point_transaction_event_ownership ownership ON ownership.point_transaction_id = pt.id
      WHERE ownership.event_id = innovation_event_id
    ), latest AS (
      SELECT DISTINCT ON (event_id, student_id) event_id, student_id, total_points
      FROM running ORDER BY event_id, student_id, created_at DESC, id DESC
    )
    INSERT INTO event_student_points (event_id, student_id, total_points, updated_at)
    SELECT event_id, student_id, total_points, CURRENT_TIMESTAMP FROM latest
    ON CONFLICT (event_id, student_id) DO UPDATE
      SET total_points = EXCLUDED.total_points, updated_at = CURRENT_TIMESTAMP;

    UPDATE event_student_points cached
    SET total_points = 0, updated_at = CURRENT_TIMESTAMP
    WHERE cached.event_id = innovation_event_id
      AND NOT EXISTS (
        SELECT 1 FROM point_transaction_event_ownership ownership
        JOIN point_transactions pt ON pt.id = ownership.point_transaction_id
        WHERE ownership.event_id = innovation_event_id AND pt.student_id = cached.student_id
      );
  END IF;
END $$;

-- Keep the optional legacy profile cache consistent without requiring a
-- StudentProfile for accounts that only use the event-specific projection.
WITH running AS (
  SELECT pt.student_id, pt.id, pt.created_at,
    GREATEST(0, SUM(pt.points) OVER (
      PARTITION BY pt.student_id ORDER BY pt.created_at, pt.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ))::integer AS total_points
  FROM point_transactions pt
), latest AS (
  SELECT DISTINCT ON (student_id) student_id, total_points
  FROM running ORDER BY student_id, created_at DESC, id DESC
)
UPDATE student_profiles profile
SET total_points = COALESCE(latest.total_points, 0)
FROM latest
WHERE profile.user_id = latest.student_id
  AND profile.total_points <> COALESCE(latest.total_points, 0);
