-- The supplied program runs Monday 9 through Friday 13 November 2026.
-- Update only the placeholder date created by the previous seed migration;
-- preserve any date already chosen by an operator.
UPDATE "events"
SET "starts_at" = TIMESTAMPTZ '2026-11-09 09:00:00-04:00'
WHERE "slug" = 'innovation-week'
  AND "starts_at" = TIMESTAMPTZ '2026-09-07 09:00:00-04:00';
