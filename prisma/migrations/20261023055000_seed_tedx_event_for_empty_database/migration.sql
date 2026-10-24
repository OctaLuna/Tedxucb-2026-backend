-- Fresh deployments need the legacy TEDx event before later migrations
-- scope historical TEDx tables to an event. Existing installations keep
-- their migrated row and metadata untouched.
INSERT INTO "events" ("slug", "name", "starts_at", "venue", "status")
SELECT 'tedxucb', 'TEDxUCB', TIMESTAMPTZ '2026-11-09 14:00:00-04:00', NULL, 'PUBLISHED'
WHERE NOT EXISTS (SELECT 1 FROM "events" WHERE "slug" = 'tedxucb')
  AND NOT EXISTS (SELECT 1 FROM "events" WHERE "name" = 'TEDxUCB');
