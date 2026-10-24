-- Selection runs were already tied to an event. Bring manual selections and
-- entry scans under the same ownership boundary; historical manual rows are
-- retained under the legacy TEDx event.
ALTER TABLE "selection_runs"
  ADD CONSTRAINT "selection_runs_id_event_id_key" UNIQUE ("id", "event_id");

ALTER TABLE "selections" ADD COLUMN "event_id" UUID;
UPDATE "selections" s SET "event_id" = r."event_id"
FROM "selection_runs" r WHERE s."run_id" = r."id" AND s."event_id" IS NULL;
UPDATE "selections" s SET "event_id" = e."id"
FROM "events" e WHERE e."slug" = 'tedxucb' AND s."event_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "selections" WHERE "event_id" IS NULL) THEN
    RAISE EXCEPTION 'No se pudo asignar evento a todas las selecciones';
  END IF;
END $$;

ALTER TABLE "selections" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "selections" ALTER COLUMN "event_id" SET DEFAULT legacy_default_event_id();
ALTER TABLE "selections" DROP CONSTRAINT IF EXISTS "selections_run_id_fkey";
ALTER TABLE "selections"
  ADD CONSTRAINT "selections_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "selections"
  ADD CONSTRAINT "selections_run_id_event_id_fkey"
  FOREIGN KEY ("run_id", "event_id") REFERENCES "selection_runs"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "one_active_selection_per_student";
CREATE UNIQUE INDEX "one_active_selection_per_student"
  ON "selections"("event_id", "student_id")
  WHERE "student_id" IS NOT NULL AND "revoked_at" IS NULL;
CREATE INDEX "selections_event_id_revoked_at_created_at_idx"
  ON "selections"("event_id", "revoked_at", "created_at" DESC);
