#!/usr/bin/env bash
# Bring up (or update) one environment's full stack. Renders its env file,
# ensures its databases exist in the shared Postgres, applies migrations, then
# starts api + powersync + web. Idempotent — safe to re-run on every PR push.
#
#   deploy/bin/up.sh <env-name>            # "staging" | "prod" | "pr-<n>"
#
# Assumes deploy/platform is already up (Traefik + shared Postgres). Image tags,
# secrets, and BASE_DOMAIN come from the environment (see render-env.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${1:?usage: up.sh <env-name>}"

ENV_FILE="$("$ROOT/deploy/bin/render-env.sh" "$ENV_NAME")"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

# 1. Ensure the env's databases exist in the shared Postgres (idempotent).
ensure_db() {
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" pace-postgres \
    psql -U "$POSTGRES_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$1'" | grep -q 1 ||
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" pace-postgres \
      createdb -U "$POSTGRES_USER" "$1"
}
ensure_db "$DB_NAME"
ensure_db "$STORAGE_DB_NAME"

# 2. Apply drizzle migrations to the env's app database (one-off migrate image).
docker run --rm --network pace-net \
  -e DATABASE_URL="$DATABASE_URL" \
  "${IMAGE_API_MIGRATE:-pace-api-migrate:local}"

# 3. Start / update the stack.
docker compose -p "$STACK" --env-file "$ENV_FILE" \
  -f "$ROOT/deploy/stack/docker-compose.yml" up -d --remove-orphans

echo "→ $ENV_NAME up at https://$HOST"
