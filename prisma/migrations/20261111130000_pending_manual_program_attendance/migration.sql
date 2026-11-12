CREATE TABLE "pending_program_attendance_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_normalized" TEXT NOT NULL,
  "program_item_id" UUID NOT NULL,
  "attendance_points" INTEGER NOT NULL DEFAULT 0,
  "exhibitor_bonus_points" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'MANUAL_ROSTER',
  "claimed_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ,
  CONSTRAINT "pending_program_attendance_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pending_program_attendance_claims_email_check" CHECK ("email_normalized" = lower(btrim("email_normalized")) AND position('@' in "email_normalized") > 1),
  CONSTRAINT "pending_program_attendance_claims_points_check" CHECK ("attendance_points" >= 0 AND "exhibitor_bonus_points" >= 0 AND ("attendance_points" > 0 OR "exhibitor_bonus_points" > 0)),
  CONSTRAINT "pending_program_attendance_claims_status_check" CHECK ("status" IN ('PENDING', 'CLAIMED', 'CANCELLED')),
  CONSTRAINT "pending_program_attendance_claims_program_item_id_fkey" FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "pending_program_attendance_claims_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "pending_program_attendance_claims_email_item_key" ON "pending_program_attendance_claims"("email_normalized", "program_item_id");
CREATE INDEX "pending_program_attendance_claims_status_email_idx" ON "pending_program_attendance_claims"("status", "email_normalized");

CREATE TABLE "program_attendance_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "program_item_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ,
  CONSTRAINT "program_attendance_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_attendance_notifications_kind_check" CHECK ("kind" IN ('ATTENDANCE', 'EXHIBITOR')),
  CONSTRAINT "program_attendance_notifications_points_check" CHECK ("points" > 0),
  CONSTRAINT "program_attendance_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "program_attendance_notifications_program_item_id_fkey" FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "program_attendance_notifications_user_item_kind_key" ON "program_attendance_notifications"("user_id", "program_item_id", "kind");
CREATE INDEX "program_attendance_notifications_user_ack_created_idx" ON "program_attendance_notifications"("user_id", "acknowledged_at", "created_at");
