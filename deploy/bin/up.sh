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
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

CF=(-p "$STACK" --env-file "$ENV_FILE" -f "$ROOT/deploy/stack/docker-compose.yml")

# 1. Start this env's databases and wait until they're accepting connections.
docker compose "${CF[@]}" up -d --wait postgres powersync-storage

# 2. Apply drizzle migrations to this env's Postgres (one-off, then exits).
docker compose "${CF[@]}" run --rm migrate

# 3. Start / update the app (api waits on healthy postgres; powersync on both).
docker compose "${CF[@]}" up -d --remove-orphans

echo "→ $ENV_NAME up at https://$HOST"
