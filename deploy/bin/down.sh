#!/usr/bin/env bash
# Tear down one environment completely: stop its containers and delete its
# volumes (its Postgres data included). Because every env owns its state, this
# is the whole cleanup — no shared database to prune. Used on PR close/merge.
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

rm -f "$ENV_FILE"
echo "→ $ENV_NAME torn down"
