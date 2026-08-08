#!/usr/bin/env bash
# Runs each Maestro flow in isolation against the already-booted emulator.
#
# Lives in a file because reactivecircus/android-emulator-runner executes its
# inline `script:` one line at a time (each as its own `sh -c`), so multi-line
# control flow can't go inline. The workflow invokes this in a single line.
#
# Each flow gets a clean slate: the session persists in secure-store and the
# auth form keeps its input, so without a reset a later flow starts already
# signed-in (or with stale text that inputText appends to) and fails.
set -u

adb install -r "$GITHUB_WORKSPACE/pace-app.apk"

fail=0
for flow in apps/mobile/.maestro/*.yaml; do
  echo "::group::maestro $flow"
  adb shell pm clear app.paceproductivity.mobile
  adb shell monkey -p app.paceproductivity.mobile -c android.intent.category.LAUNCHER 1
  sleep 5
  maestro test "$flow" || fail=1
  echo "::endgroup::"
done

exit "$fail"
