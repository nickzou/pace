-- Phase 5 backfill: grandfather every account that predates the email-verification
-- gate. Runs exactly once (drizzle records applied migrations), so it verifies the
-- users who exist at cutover and never re-runs — future sign-ups still start
-- unverified and must confirm. This is what makes it safe to enable
-- REQUIRE_EMAIL_VERIFICATION without locking existing users out.
--
-- Deliberately a one-time migration rather than a step in db:migrate's script,
-- which fires on every deploy and would keep auto-verifying new unverified users.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
