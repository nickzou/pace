-- PowerSync (M11) reads row changes from Postgres logical-replication
-- publications named per synced table; it creates the replication slot itself
-- but not the publication, so we own that here. This one is scoped to `items`
-- (a generic synced resource) to keep auth/session churn out of the replication
-- stream. Add future synced tables with ALTER PUBLICATION.
--
-- Guarded so it's a no-op where the publication already exists (a dev DB where
-- it was created by hand, or a re-run), since CREATE PUBLICATION isn't
-- idempotent on its own.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync_items') THEN
    CREATE PUBLICATION powersync_items FOR TABLE items;
  END IF;
END $$;
