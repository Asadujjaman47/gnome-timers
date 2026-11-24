#!/usr/bin/env bash
# Takes screenshots of the extension in a headless GNOME Shell, in dark,
# light, high-contrast and large-text styles, and checks the lock-screen
# behaviour. Everything runs with its own settings; the real session is not
# touched. Output: build/screenshots/*.png and driver.log.
#
# Usage: tools/screenshots/run.sh <extension zip> <uuid>
set -euo pipefail

ZIP=$(realpath "$1")
UUID=$2
ROOT=$(realpath "$(dirname "$0")/../..")
OUT=$ROOT/build/screenshots
WORK=$ROOT/build/screenshots-session
DRIVER_UUID=timers-screenshot-driver@asadujjaman47.github.io

rm -rf "$OUT" "$WORK"
mkdir -p "$OUT" "$WORK/data" "$WORK/config" "$WORK/cache"
gnome-extensions pack --force --out-dir="$WORK" "$ROOT/tools/screenshots/driver" >/dev/null

# The Wayland socket path must stay under 108 bytes, so use a short runtime dir.
RUNTIME=/run/user/$(id -u)/timers-shots-$$
mkdir -m 700 "$RUNTIME"
trap 'rm -rf "${RUNTIME:?}"' EXIT

env -u WAYLAND_DISPLAY -u DISPLAY \
    XDG_DATA_HOME="$WORK/data" XDG_CONFIG_HOME="$WORK/config" XDG_CACHE_HOME="$WORK/cache" \
    XDG_RUNTIME_DIR="$RUNTIME" TIMERS_SCREENSHOT_DIR="$OUT" \
    dbus-run-session -- bash -c '
        set -e
        gnome-extensions install --force "$0"
        gnome-extensions install --force "$1"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell enabled-extensions "[\"$2\", \"$3\"]"
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 \
            >"$TIMERS_SCREENSHOT_DIR/shell.log" 2>&1 &
        shell=$!
        for _ in $(seq 1 120); do
            grep -qx DONE "$TIMERS_SCREENSHOT_DIR/driver.log" 2>/dev/null && break
            sleep 1
        done
        kill "$shell"; wait "$shell" 2>/dev/null || true
    ' "$ZIP" "$WORK/$DRIVER_UUID.shell-extension.zip" "$UUID" "$DRIVER_UUID" 2>/dev/null

echo "Screenshots in $OUT:"
ls "$OUT"
echo "--- driver.log"
cat "$OUT/driver.log"
echo "--- extension messages and JS problems in shell.log"
grep -iE "timers|JS ERROR|JS WARNING|TypeError|ReferenceError" "$OUT/shell.log" || echo "(none)"
