ALTER TABLE "activity_categories" ADD COLUMN "event_id" UUID;
ALTER TABLE "activities" ADD COLUMN "event_id" UUID;

DO $$
DECLARE tedx_id UUID;
BEGIN
  SELECT id INTO tedx_id FROM "events" WHERE slug = 'tedxucb';
  IF tedx_id IS NULL THEN
    RAISE EXCEPTION 'Cannot scope legacy activities: TEDxUCB event (slug=tedxucb) is missing';
  END IF;
  UPDATE "activity_categories" SET "event_id" = tedx_id WHERE "event_id" IS NULL;
  UPDATE "activities" SET "event_id" = tedx_id WHERE "event_id" IS NULL;
END $$;

ALTER TABLE "activity_categories" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "event_id" SET NOT NULL;

ALTER TABLE "activity_categories" ADD CONSTRAINT "activity_categories_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "activity_categories_name_key";
CREATE UNIQUE INDEX "activity_categories_event_id_name_key" ON "activity_categories"("event_id", "name");
CREATE UNIQUE INDEX "activity_categories_id_event_id_key" ON "activity_categories"("id", "event_id");
ALTER TABLE "activities" ADD CONSTRAINT "activities_category_id_event_id_fkey"
  FOREIGN KEY ("category_id", "event_id") REFERENCES "activity_categories"("id", "event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "activity_categories_event_id_idx" ON "activity_categories"("event_id");
CREATE INDEX "activities_event_id_status_starts_at_idx" ON "activities"("event_id", "status", "starts_at" DESC);