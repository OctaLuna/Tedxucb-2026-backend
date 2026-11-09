-- Attendance and event points belong to an authenticated account. A
-- StudentProfile is optional academic data and must not gate check-in.
-- Existing rows are retained; every previous student_profile.user_id is
-- already a users.id, so widening these FKs preserves their identity.
ALTER TABLE "attendances"
  DROP CONSTRAINT IF EXISTS "attendances_student_id_fkey",
  ADD CONSTRAINT "attendances_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "point_transactions"
  DROP CONSTRAINT IF EXISTS "point_transactions_student_id_fkey",
  ADD CONSTRAINT "point_transactions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_student_points"
  DROP CONSTRAINT IF EXISTS "event_student_points_student_fkey",
  ADD CONSTRAINT "event_student_points_student_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Repair only Innovation Week's legacy attendances that do not yet have an
-- immutable ledger entry. Attendance ID is unique on the ledger, so a retry
-- is safe. The current configured activity value is used where no historical
-- point snapshot exists on attendance.
DO $$
DECLARE innovation_event_id UUID;
BEGIN
  SELECT id INTO innovation_event_id FROM events WHERE slug = 'innovation-week';
  IF innovation_event_id IS NOT NULL THEN
    PERFORM set_config('ted.event_id', innovation_event_id::text, true);
    INSERT INTO point_transactions (
      student_id, points, type, activity_id, attendance_id,
      reason, created_by, idempotency_key, created_at
    )
    SELECT a.student_id, activity.points_value, 'ACTIVITY', a.activity_id,
      a.id, 'Backfill seguro de asistencia existente en Innovation Week',
      a.validated_by, 'historical-attendance:' || a.id::text, a.checked_in_at
    FROM attendances a
    JOIN activities activity ON activity.id = a.activity_id
    WHERE activity.event_id = innovation_event_id
      AND a.status = 'APPROVED'
      AND activity.points_value > 0
      AND NOT EXISTS (
        SELECT 1 FROM point_transactions existing WHERE existing.attendance_id = a.id
      );
  END IF;
END $$;

-- Normalize the event projection after the backfill. This is idempotent and
-- leaves the append-only ledger untouched; it also preserves the ledger's
-- chronological floor-at-zero semantics if historical awards predate a
-- penalty already recorded.
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
        WHERE ownership.event_id = innovation_event_id
          AND EXISTS (
            SELECT 1 FROM point_transactions pt
            WHERE pt.id = ownership.point_transaction_id AND pt.student_id = cached.student_id
          )
      );
  END IF;
END $$;

-- Keep the legacy global total_points cache coherent for profile-bearing
-- accounts. It remains derived data; event displays use event_student_points.
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
FROM (SELECT profile_id.user_id, latest.total_points
      FROM student_profiles profile_id
      LEFT JOIN latest ON latest.student_id = profile_id.user_id) latest
WHERE profile.user_id = latest.user_id
  AND profile.total_points <> COALESCE(latest.total_points, 0);
