#!/usr/bin/env bash
# Takes screenshots of the extension in a headless GNOME Shell, in dark,
# light, high-contrast and large-text styles, and checks the lock-screen
# behaviour. Everything runs with its own settings; the real session is not
# touched. Output: build/screenshots/*.png and driver.log.
#
# Usage: tools/screenshots/run.sh <extension zip> <uuid>
# TIMERS_SCREENSHOTS_OUT overrides the output folder, TIMERS_DRIVER_SCENARIO=qa
# runs the storage/memory/power checks instead (tools/screenshots/driver/qa.js).
set -euo pipefail

ZIP=$(realpath "$1")
UUID=$2
ROOT=$(realpath "$(dirname "$0")/../..")
OUT=${TIMERS_SCREENSHOTS_OUT:-$ROOT/build/screenshots}
WORK=$OUT-session
DRIVER_UUID=timers-screenshot-driver@asadujjaman47.github.io

rm -rf "$OUT" "$WORK"
mkdir -p "$OUT" "$WORK/data" "$WORK/config" "$WORK/cache"
gnome-extensions pack --force --out-dir="$WORK" --extra-source=qa.js "$ROOT/tools/screenshots/driver" >/dev/null

# The Wayland socket path must stay under 108 bytes, so use a short runtime dir.
RUNTIME=/run/user/$(id -u)/timers-shots-$$
mkdir -p "$(dirname "$RUNTIME")"
mkdir -m 700 "$RUNTIME"
# Processes started in the test session (e.g. the document portal) carry its
# runtime dir; they are stopped and the portal's FUSE mount at $RUNTIME/doc is
# unmounted, or the folder could not be removed. Cleanup never changes the
# script's exit status: under `set -e` a failing command here would.
session_pids() {
    local environ pid
    for environ in /proc/[0-9]*/environ; do
        pid=${environ#/proc/}
        pid=${pid%/environ}
        [[ $pid == "$$" || $pid == "$BASHPID" ]] && continue
        if { tr '\0' '\n' <"$environ"; } 2>/dev/null | grep -qx "XDG_RUNTIME_DIR=$RUNTIME"; then
            echo "$pid"
        fi
    done
}

cleanup() {
    local status=$? pids
    mapfile -t pids < <(session_pids || true)
    if [[ ${#pids[@]} -gt 0 ]]; then
        kill -TERM "${pids[@]}" 2>/dev/null || true
        sleep 1
    fi
    fusermount3 -u "$RUNTIME/doc" 2>/dev/null || fusermount -u "$RUNTIME/doc" 2>/dev/null || true
    rm -rf "${RUNTIME:?}" 2>/dev/null || true
    return "$status"
}
trap cleanup EXIT

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
        # Never leave the shell running, even when interrupted.
        trap "kill $shell 2>/dev/null || true" EXIT INT TERM
        for _ in $(seq 1 "${TIMERS_DRIVER_TIMEOUT:-120}"); do
            grep -qx DONE "$TIMERS_SCREENSHOT_DIR/driver.log" 2>/dev/null && break
            sleep 1
        done
        kill "$shell"; wait "$shell" 2>/dev/null || true
    ' "$ZIP" "$WORK/$DRIVER_UUID.shell-extension.zip" "$UUID" "$DRIVER_UUID" 2>"$OUT/session.log"

echo "Screenshots in $OUT:"
ls "$OUT"
echo "--- driver.log"
cat "$OUT/driver.log"
echo "--- extension messages and JS problems in shell.log"
grep -iE "timers|JS ERROR|JS WARNING|TypeError|ReferenceError" "$OUT/shell.log" || echo "(none)"
