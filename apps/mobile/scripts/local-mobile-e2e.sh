#!/usr/bin/env bash
# Local mobile e2e — the NixOS mirror of .github/workflows/mobile-e2e.yml, so the Maestro
# flows can be run against a local emulator instead of pushing to CI.
#
#   nix develop .#android -c pnpm --filter @pace/mobile test:e2e:local
#
# Everything lands in pace_test on the e2e Postgres — NEVER your dev DB. That was the trap:
# `nitro dev` auto-loads the repo .env and clobbers a passed DATABASE_URL, so sign-ups leaked
# into dev while PowerSync replicated pace_test → empty sync. This uses the *production* api
# server (`build && start`) + .env.e2e, which the repo .env can't override.
#
# Env knobs:  SKIP_APK_BUILD=1  reuse an existing pace-app.apk (iterate on flows, not the app)
#             KEEP_STACK=1      leave the docker stack + emulator up on exit (default: leave
#                               them; only the api we start is torn down)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v adb >/dev/null || die "run inside the android devshell: nix develop .#android -c pnpm --filter @pace/mobile test:e2e:local"
command -v maestro >/dev/null || die "maestro not on PATH — are you in the .#android shell?"
[ -f .env.e2e ] || die "missing .env.e2e at repo root"

# 1. Free :3001 so a stray api can't serve the flows the dev DB (the bug that ate an evening).
say "Freeing :3001"
for pid in $(lsof -ti tcp:3001 2>/dev/null || true); do kill "$pid" 2>/dev/null || true; done

# 2. e2e stack (Postgres :5433 + PowerSync :8180, JWKS → :3001) + pace_test schema.
say "Bringing up the e2e stack (API_PORT=3001)"
API_PORT=3001 docker compose -f docker-compose.e2e.yml up -d --wait
docker compose -f docker-compose.e2e.yml exec -T postgres \
  psql -U pace -d pace -c "CREATE DATABASE pace_test" >/dev/null 2>&1 || true

set -a; source .env.e2e; set +a  # DATABASE_URL etc. now win for every child below

say "Migrating pace_test"
pnpm --filter @pace/api db:migrate

# 3. Production api on :3001 against pace_test (build && start ignores the repo .env).
say "Building + starting the api on :3001"
pnpm --filter @pace/api build
PORT=3001 pnpm --filter @pace/api start > /tmp/pace-local-e2e-api.log 2>&1 &
API_PID=$!
cleanup() { kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 40); do curl -sf http://localhost:3001/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://localhost:3001/health >/dev/null 2>&1 || { cat /tmp/pace-local-e2e-api.log; die "api failed to start on :3001"; }

# 4. Emulator — reuse a running one, else boot the `pace` AVD headless.
if ! adb devices | grep -q 'emulator-.*device'; then
  say "Booting the 'pace' emulator (headless)"
  emulator -avd pace -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -read-only \
    > /tmp/pace-local-e2e-emulator.log 2>&1 &
  adb wait-for-device
  for _ in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 3; done
fi
adb devices | grep -q 'emulator-.*device' || die "no emulator (create it: avdmanager create avd -n pace -k 'system-images;android-34;google_apis;x86_64' --device pixel_6)"

# 5. Build the APK (the flake's Gradle NixOS shim handles aapt2/NDK/build-tools — no flags).
if [ "${SKIP_APK_BUILD:-0}" = "1" ] && [ -f "$ROOT/pace-app.apk" ]; then
  say "Reusing existing pace-app.apk (SKIP_APK_BUILD=1)"
else
  say "Building the release APK"
  ( cd apps/mobile
    npx expo prebuild --platform android --no-install
    ./android/gradlew -p android assembleRelease --no-daemon
    cp android/app/build/outputs/apk/release/app-release.apk "$ROOT/pace-app.apk" )
fi

# 6. Install + run every flow, reusing CI's exact runner (GITHUB_WORKSPACE points it at our APK).
say "Running Maestro flows"
GITHUB_WORKSPACE="$ROOT" MAESTRO_CLI_NO_ANALYTICS=1 bash .github/scripts/mobile-e2e.sh
say "Done — pace_test only, your dev DB untouched."
