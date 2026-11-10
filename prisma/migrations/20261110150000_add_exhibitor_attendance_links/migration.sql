ALTER TABLE "program_attendance_links"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ATTENDANCE';

ALTER TABLE "program_attendance_links"
  ADD CONSTRAINT "program_attendance_links_kind_check"
  CHECK ("kind" IN ('ATTENDANCE', 'EXHIBITOR'));

DROP INDEX "program_attendance_links_one_active_per_item_key";
CREATE UNIQUE INDEX "program_attendance_links_one_active_per_item_kind_key"
  ON "program_attendance_links"("program_item_id", "kind")
  WHERE "revoked_at" IS NULL;
