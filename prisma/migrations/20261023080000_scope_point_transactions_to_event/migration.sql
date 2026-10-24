-- Keep point_transactions append-only. Event ownership is stored in a side
-- table so historical attribution never UPDATEs the ledger rows.
CREATE TABLE "point_transaction_event_ownership" (
  "point_transaction_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_transaction_event_ownership_pkey" PRIMARY KEY ("point_transaction_id"),
  CONSTRAINT "point_transaction_event_ownership_transaction_fkey"
    FOREIGN KEY ("point_transaction_id") REFERENCES "point_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "point_transaction_event_ownership_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Activity-derived movements inherit their activity event. Legacy adjustments
-- with no activity remain assigned to the legacy TEDx event. The ledger itself
-- is only read; ownership attribution is inserted as new metadata rows.
INSERT INTO "point_transaction_event_ownership" ("point_transaction_id", "event_id")
SELECT pt."id", COALESCE(a."event_id", tedx."id")
FROM "point_transactions" pt
LEFT JOIN "activities" a ON a."id" = pt."activity_id"
CROSS JOIN LATERAL (SELECT e."id" FROM "events" e WHERE e."slug" = 'tedxucb') tedx;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "point_transaction_event_ownership") <> (SELECT COUNT(*) FROM "point_transactions") THEN
    RAISE EXCEPTION 'No se pudo asignar evento a todos los movimientos del ledger';
  END IF;
END $$;

CREATE INDEX "point_transaction_event_ownership_event_id_point_transaction_id_idx"
  ON "point_transaction_event_ownership"("event_id", "point_transaction_id");

CREATE OR REPLACE FUNCTION legacy_default_event_id() RETURNS UUID AS $$
DECLARE result UUID;
BEGIN
  SELECT id INTO result FROM events WHERE slug = 'tedxucb';
  IF result IS NULL THEN RAISE EXCEPTION 'El evento legado tedxucb no está configurado'; END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
