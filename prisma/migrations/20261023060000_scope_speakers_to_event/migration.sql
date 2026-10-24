ALTER TABLE "speakers" ADD COLUMN "event_id" UUID;
ALTER TABLE "speaker_applications" ADD COLUMN "event_id" UUID;

DO $$
DECLARE tedx_id UUID;
BEGIN
  SELECT id INTO tedx_id FROM "events" WHERE slug = 'tedxucb';
  IF tedx_id IS NULL THEN
    RAISE EXCEPTION 'Cannot scope legacy speaker data: TEDxUCB event (slug=tedxucb) is missing';
  END IF;
  UPDATE "speakers" SET "event_id" = tedx_id WHERE "event_id" IS NULL;
  UPDATE "speaker_applications" SET "event_id" = tedx_id WHERE "event_id" IS NULL;
END $$;

ALTER TABLE "speakers" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "speaker_applications" ALTER COLUMN "event_id" SET NOT NULL;

ALTER TABLE "speakers" ADD CONSTRAINT "speakers_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "speaker_applications" ADD CONSTRAINT "speaker_applications_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "speakers_event_id_status_display_order_idx" ON "speakers"("event_id", "status", "display_order");
CREATE INDEX "speaker_applications_event_id_status_created_at_idx" ON "speaker_applications"("event_id", "status", "created_at" DESC);
