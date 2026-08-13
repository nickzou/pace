#!/usr/bin/env bash
# Bring up (or update) one environment's full, self-contained stack — its own
# Postgres + powersync-storage + api + powersync + web. Idempotent: safe to
# re-run on every PR push (updates the same env in place). Nothing shared is
# touched, so one env's deploy can't affect another's data.
#
#   deploy/bin/up.sh <env-name>            # "staging" | "prod" | "pr-<n>"
#
# Assumes deploy/platform is up (Traefik + pace-net). Image tags, secrets, and
# BASE_DOMAIN come from the environment (see render-env.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${1:?usage: up.sh <env-name>}"

ENV_FILE="$("$ROOT/deploy/bin/render-env.sh" "$ENV_NAME")"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

CF=(-p "$STACK" --env-file "$ENV_FILE" -f "$ROOT/deploy/stack/docker-compose.yml")

# Ephemeral previews (pr-<n>) get an HTTP Basic Auth gate on the web/UI router so
# stray visitors can't browse them; prod is never gated. Only applied when a
# credential is supplied via the environment (BASIC_AUTH_USERS, htpasswd format —
# kept OUT of the env file so its `$`s survive sourcing). Missing credential → the
# preview still comes up, just ungated, with a warning.
case "$ENV_NAME" in
  pr-*)
    if [ -n "${BASIC_AUTH_USERS:-}" ]; then
      CF+=(-f "$ROOT/deploy/stack/preview.override.yml")
    else
      echo "warning: BASIC_AUTH_USERS unset — $ENV_NAME will be publicly reachable (no basic-auth gate)" >&2
    fi
    ;;
esac

# 1. Start this env's databases and wait until they're accepting connections.
docker compose "${CF[@]}" up -d --wait postgres powersync-storage

# 2. Apply drizzle migrations to this env's Postgres (one-off, then exits).
docker compose "${CF[@]}" run --rm migrate

# 2b. Seed a known-password test user into NON-prod envs (idempotent) so a
# reviewer can log straight into a gated preview. Prod is never seeded.
if [ "$ENV_NAME" != "prod" ]; then
  docker compose "${CF[@]}" run --rm seed
fi

# 3. Start / update the app (api waits on healthy postgres; powersync on both).
docker compose "${CF[@]}" up -d --remove-orphans

echo "→ $ENV_NAME up at https://$HOST"
