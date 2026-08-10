-- PowerSync (M11) reads row changes from a Postgres logical-replication
-- publication named `powersync`; it creates the replication slot itself but not
-- the publication, so we own that here. Scoped to `tasks` (the only synced
-- table) to keep auth/session churn out of the replication stream — add future
-- synced tables with ALTER PUBLICATION.
--
-- Guarded so it's a no-op where the publication already exists (a dev DB where
-- it was created by hand, or a re-run), since CREATE PUBLICATION isn't
-- idempotent on its own.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE tasks;
  END IF;
END $$;
