#!/usr/bin/env bash
#
# Quits a running mboard and waits for it to exit, so a rebuild can replace the bundle and the next launch
# runs the new build. mboard stays in the menu bar after its window closes, so `open` alone would only bring
# back the old process. Settings in ~/Library/Application Support/mboard are left as they are.

set -euo pipefail

readonly BUNDLE_ID="com.electron.mboard"
readonly EXECUTABLE_NAME="mboard"
readonly TIMEOUT_SECONDS=15
readonly POLL_INTERVAL_SECONDS=0.2

is_running() {
  pgrep -xq "${EXECUTABLE_NAME}"
}

is_running || exit 0

echo "Quitting mboard…"
osascript -e "tell application id \"${BUNDLE_ID}\" to quit"

readonly deadline=$((SECONDS + TIMEOUT_SECONDS))
while ((SECONDS < deadline)); do
  is_running || exit 0
  sleep "${POLL_INTERVAL_SECONDS}"
done

echo "mboard did not quit within ${TIMEOUT_SECONDS}s. Quit it from the menu bar and try again." >&2
exit 1
