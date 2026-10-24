-- Tie each invitation token to the event whose frontend receives the link.
-- Existing invitations can only be preserved when exactly one supported,
-- active event scope makes their target unambiguous. All other legacy tokens
-- are invalidated; they never granted access themselves.
ALTER TABLE "identity_invitations" ADD COLUMN "event_id" UUID;

WITH unambiguous_scopes AS (
  SELECT access."email_normalized", (array_agg(access."event_id"))[1] AS "event_id"
  FROM "event_email_access" AS access
  JOIN "events" AS event ON event."id" = access."event_id"
  WHERE access."revoked_at" IS NULL
    AND event."slug" IN ('tedxucb', 'innovation-week')
  GROUP BY access."email_normalized"
  HAVING count(*) = 1
)
UPDATE "identity_invitations" AS invitation
SET "event_id" = scope."event_id"
FROM unambiguous_scopes AS scope
WHERE invitation."email" = scope."email_normalized";

DELETE FROM "identity_invitations" WHERE "event_id" IS NULL;

ALTER TABLE "identity_invitations" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "identity_invitations"
  ADD CONSTRAINT "identity_invitations_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "identity_invitations_event_id_email_idx"
  ON "identity_invitations"("event_id", "email");