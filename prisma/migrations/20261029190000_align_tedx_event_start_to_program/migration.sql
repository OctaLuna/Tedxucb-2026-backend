-- Align only the original seed timestamp with the confirmed TEDx program.
-- Preserve any event date that an operator already changed intentionally.
UPDATE "events"
SET "starts_at" = TIMESTAMPTZ '2026-11-12 14:15:00-04:00'
WHERE "slug" = 'tedxucb'
  AND "name" = 'TEDxUCB'
  AND "starts_at" = TIMESTAMPTZ '2026-11-09 14:00:00-04:00';
