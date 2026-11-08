CREATE TABLE "program_enrollments" (
  "user_id" UUID NOT NULL,
  "program_item_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "program_enrollments_pkey" PRIMARY KEY ("user_id", "program_item_id"),
  CONSTRAINT "program_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "program_enrollments_program_item_id_fkey" FOREIGN KEY ("program_item_id") REFERENCES "event_program_items"("id") ON DELETE RESTRICT
);
CREATE INDEX "program_enrollments_program_item_id_idx" ON "program_enrollments"("program_item_id");
