-- Expand only: preserve all existing event IDs and avoid guessing ownership.
ALTER TABLE "events" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

CREATE TABLE "event_email_access" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_normalized" TEXT NOT NULL,
  "event_id" UUID NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_email_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_access_email_normalized" CHECK ("email_normalized" = lower(trim("email_normalized")) AND length("email_normalized") > 0),
  CONSTRAINT "event_email_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_email_access_email_normalized_event_id_key" ON "event_email_access"("email_normalized", "event_id");
CREATE INDEX "event_email_access_event_id_email_normalized_idx" ON "event_email_access"("event_id", "email_normalized");
