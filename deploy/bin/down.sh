#!/usr/bin/env bash
# Tear down one environment: stop its containers + volumes, then drop its
# databases from the shared Postgres. Used on PR close/merge.
#
#   deploy/bin/down.sh <env-name>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${1:?usage: down.sh <env-name>}"

ENV_FILE="$ROOT/deploy/envs/${ENV_NAME}.env"
[ -f "$ENV_FILE" ] || ENV_FILE="$("$ROOT/deploy/bin/render-env.sh" "$ENV_NAME")"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

docker compose -p "$STACK" --env-file "$ENV_FILE" \
  -f "$ROOT/deploy/stack/docker-compose.yml" down -v --remove-orphans || true

# Drop the env's databases (force closes PowerSync's replication connections).
for db in "$DB_NAME" "$STORAGE_DB_NAME"; do
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" pace-postgres \
    dropdb -U "$POSTGRES_USER" --force --if-exists "$db" || true
done

rm -f "$ENV_FILE"
echo "→ $ENV_NAME torn down"
