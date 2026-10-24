-- The historical published row predates event slugs. Bind it to the stable
-- TEDx slug without changing its UUID or any operational data.
DO $$
DECLARE
  legacy_tedx_count INTEGER;
  current_slug TEXT;
  legacy_tedx_id UUID;
BEGIN
  SELECT count(*)::INTEGER, (array_agg("id"))[1], (array_agg("slug"))[1]
    INTO legacy_tedx_count, legacy_tedx_id, current_slug
  FROM "events"
  WHERE "name" = 'TEDxUCB';

  IF legacy_tedx_count > 1 THEN
    RAISE EXCEPTION 'Cannot assign tedxucb slug: found % legacy TEDxUCB events', legacy_tedx_count;
  END IF;

  IF legacy_tedx_count = 1 AND current_slug IS NULL THEN
    IF EXISTS (SELECT 1 FROM "events" WHERE "slug" = 'tedxucb') THEN
      RAISE EXCEPTION 'Cannot assign tedxucb slug: slug already belongs to another event';
    END IF;
    UPDATE "events" SET "slug" = 'tedxucb' WHERE "id" = legacy_tedx_id;
  ELSIF legacy_tedx_count = 1 AND current_slug <> 'tedxucb' THEN
    RAISE EXCEPTION 'Cannot assign tedxucb slug: the legacy TEDx row already has a different slug';
  END IF;
END $$;
