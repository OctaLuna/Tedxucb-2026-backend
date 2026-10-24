ALTER TABLE "speakers" ADD CONSTRAINT "speakers_id_event_id_key" UNIQUE ("id", "event_id");

CREATE TABLE "event_program_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "speaker_id" UUID,
  "created_by" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'TALK',
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_program_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_program_items_title_nonempty" CHECK (length(btrim("title")) BETWEEN 1 AND 180),
  CONSTRAINT "event_program_items_time_order" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "event_program_items_display_order_nonnegative" CHECK ("display_order" >= 0),
  CONSTRAINT "event_program_items_type_check" CHECK ("type" IN ('OPENING', 'TALK', 'BREAK', 'PERFORMANCE', 'CLOSING', 'OTHER')),
  CONSTRAINT "event_program_items_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  CONSTRAINT "event_program_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_program_items_speaker_event_fkey" FOREIGN KEY ("speaker_id", "event_id") REFERENCES "speakers"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_program_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "event_program_items_event_id_status_starts_at_idx" ON "event_program_items"("event_id", "status", "starts_at");
CREATE INDEX "event_program_items_event_id_display_order_starts_at_idx" ON "event_program_items"("event_id", "display_order", "starts_at");
