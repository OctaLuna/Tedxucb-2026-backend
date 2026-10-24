-- Compatibility migration for isolated databases that briefly ran the
-- experimental 20261023080000 column-based version. Normal fresh installs
-- already have the ownership table from 0800 and this block is a no-op.
CREATE TABLE IF NOT EXISTS "point_transaction_event_ownership" (
  "point_transaction_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_transaction_event_ownership_pkey" PRIMARY KEY ("point_transaction_id"),
  CONSTRAINT "point_transaction_event_ownership_transaction_fkey"
    FOREIGN KEY ("point_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "point_transaction_event_ownership_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'point_transactions' AND column_name = 'event_id'
  ) THEN
    INSERT INTO "point_transaction_event_ownership" ("point_transaction_id", "event_id")
      SELECT "id", "event_id" FROM "point_transactions"
      ON CONFLICT ("point_transaction_id") DO NOTHING;
    ALTER TABLE "point_transactions" DROP CONSTRAINT IF EXISTS "point_transactions_event_id_fkey";
    DROP INDEX IF EXISTS "point_transactions_event_id_student_id_created_at_idx";
    ALTER TABLE "point_transactions" ALTER COLUMN "event_id" DROP DEFAULT;
    ALTER TABLE "point_transactions" DROP COLUMN "event_id";
  END IF;
END $$;

INSERT INTO "point_transaction_event_ownership" ("point_transaction_id", "event_id")
SELECT pt."id", COALESCE(a."event_id", tedx."id")
FROM "point_transactions" pt
LEFT JOIN "activities" a ON a."id" = pt."activity_id"
CROSS JOIN LATERAL (SELECT e."id" FROM "events" e WHERE e."slug" = 'tedxucb') tedx
ON CONFLICT ("point_transaction_id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "point_transaction_event_ownership_event_id_point_transaction_id_idx"
  ON "point_transaction_event_ownership"("event_id", "point_transaction_id");
