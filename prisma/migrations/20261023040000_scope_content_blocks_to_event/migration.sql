-- Expand/contract step 1: content blocks belong to one stable event.
-- Legacy content is assigned only when there is exactly one published event.
ALTER TABLE "content_blocks" ADD COLUMN "event_id" UUID;

DO $$
DECLARE
  published_count INTEGER;
  published_event UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM "content_blocks") THEN
    SELECT count(*)::INTEGER, (array_agg("id"))[1] INTO published_count, published_event
    FROM "events"
    WHERE "status" = 'PUBLISHED';

    IF published_count <> 1 THEN
      RAISE EXCEPTION 'Cannot backfill content_blocks: expected exactly one published legacy event, found %', published_count;
    END IF;

    UPDATE "content_blocks" SET "event_id" = published_event WHERE "event_id" IS NULL;
  END IF;
END $$;

ALTER TABLE "content_blocks" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "content_blocks"
  ADD CONSTRAINT "content_blocks_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "content_blocks_key_key";
CREATE UNIQUE INDEX "content_blocks_event_id_key_key" ON "content_blocks"("event_id", "key");
CREATE INDEX "content_blocks_event_id_updated_at_idx" ON "content_blocks"("event_id", "updated_at" DESC);

-- The API now resolves event snapshots by slug; selection endpoints retain
-- their explicit TEDx legacy context until their own event-scoped migration.
DROP INDEX IF EXISTS "one_published_event";
