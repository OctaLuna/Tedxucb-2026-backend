-- Register the second existing event using the metadata already published by
-- its frontend. Do not overwrite an operator-managed event row on reruns.
INSERT INTO "events" ("slug", "name", "starts_at", "venue", "status")
SELECT 'innovation-week', 'Semana de la Facultad', '2026-11-09T09:00:00-04:00',
       'Universidad Católica Boliviana', 'PUBLISHED'
WHERE NOT EXISTS (SELECT 1 FROM "events" WHERE "slug" = 'innovation-week');
