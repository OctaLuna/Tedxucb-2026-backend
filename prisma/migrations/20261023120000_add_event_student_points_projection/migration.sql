CREATE TABLE "event_student_points" (
  "event_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "total_points" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_student_points_pkey" PRIMARY KEY ("event_id", "student_id"),
  CONSTRAINT "event_student_points_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_student_points_student_fkey"
    FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_student_points_total_non_negative" CHECK ("total_points" >= 0)
);
CREATE INDEX "event_student_points_event_id_total_points_idx"
  ON "event_student_points"("event_id", "total_points" DESC);

-- Rebuild only the projection; do not UPDATE/DELETE the immutable point ledger.
WITH running AS (
  SELECT ownership.event_id, pt.student_id, pt.id, pt.created_at,
    GREATEST(0, SUM(pt.points) OVER (
      PARTITION BY ownership.event_id, pt.student_id
      ORDER BY pt.created_at, pt.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ))::integer AS total_points
  FROM point_transactions pt
  JOIN point_transaction_event_ownership ownership ON ownership.point_transaction_id = pt.id
), latest AS (
  SELECT DISTINCT ON (event_id, student_id) event_id, student_id, total_points
  FROM running ORDER BY event_id, student_id, created_at DESC, id DESC
)
INSERT INTO event_student_points (event_id, student_id, total_points)
SELECT event_id, student_id, total_points FROM latest;

-- Every future ledger insert receives an immutable event owner and updates its
-- per-event projection in the same database transaction. The application sets
-- ted.event_id after authorization; legacy writes resolve to TEDx.
CREATE OR REPLACE FUNCTION assign_point_transaction_event_ownership() RETURNS TRIGGER AS $$
DECLARE selected_event_id UUID;
BEGIN
  selected_event_id := NULLIF(current_setting('ted.event_id', true), '')::uuid;
  IF selected_event_id IS NULL THEN
    selected_event_id := legacy_default_event_id();
  END IF;
  INSERT INTO point_transaction_event_ownership (point_transaction_id, event_id)
  VALUES (NEW.id, selected_event_id);
  INSERT INTO event_student_points (event_id, student_id, total_points, updated_at)
  VALUES (selected_event_id, NEW.student_id, GREATEST(0, NEW.points), CURRENT_TIMESTAMP)
  ON CONFLICT (event_id, student_id) DO UPDATE
    SET total_points = GREATEST(0, event_student_points.total_points + NEW.points),
        updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
