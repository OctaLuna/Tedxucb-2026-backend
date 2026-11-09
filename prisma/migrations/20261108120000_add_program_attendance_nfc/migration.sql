CREATE TABLE "program_attendances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "program_item_id" UUID NOT NULL,
  "checked_in_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL DEFAULT 'NFC_LINK',
  CONSTRAINT "program_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_attendances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "program_attendances_program_item_id_fkey"
    FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "program_attendances_user_item_key" UNIQUE ("user_id", "program_item_id")
);
CREATE INDEX "program_attendances_item_time_idx"
  ON "program_attendances"("program_item_id", "checked_in_at");

CREATE TABLE "program_attendance_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "program_item_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "program_attendance_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_attendance_links_program_item_id_fkey"
    FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "program_attendance_links_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "program_attendance_links_token_hash_key" UNIQUE ("token_hash")
);
CREATE INDEX "program_attendance_links_item_revoked_idx"
  ON "program_attendance_links"("program_item_id", "revoked_at");
CREATE UNIQUE INDEX "program_attendance_links_one_active_per_item_key"
  ON "program_attendance_links"("program_item_id") WHERE "revoked_at" IS NULL;
