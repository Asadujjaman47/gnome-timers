#!/usr/bin/env bash
# Runs the headless screenshot and lock-screen checks (tools/screenshots)
# against another GNOME Shell version, inside a throwaway container.
#
# Usage: tools/compat/run.sh <target>    e.g. ubuntu-24.04 (GNOME 46)
# Output: build/compat/<target>/  (screenshots, driver.log, shell.log)
#
# Needs podman. The image is built once and reused; remove it with
#   podman rmi localhost/timers-compat:<target>
set -euo pipefail

TARGET=${1:?usage: tools/compat/run.sh <target>}
ROOT=$(realpath "$(dirname "$0")/../..")
CONTAINERFILE=$ROOT/tools/compat/Containerfile.$TARGET
IMAGE=localhost/timers-compat:$TARGET
UUID=timers@asadujjaman47.github.io
OUT=build/compat/$TARGET

[[ -f $CONTAINERFILE ]] || { echo "No $CONTAINERFILE" >&2; exit 1; }

podman build --quiet -t "$IMAGE" -f "$CONTAINERFILE" "$ROOT/tools/compat" >/dev/null
make -C "$ROOT" --no-print-directory pack >/dev/null

# The GPU render node is passed through when available; Mesa falls back to
# software rendering otherwise.
devices=()
[[ -e /dev/dri/renderD128 ]] && devices=(--device /dev/dri/renderD128)

podman run --rm "${devices[@]}" \
    --security-opt label=disable \
    -v "$ROOT:/src" -w /src \
    -e TIMERS_SCREENSHOTS_OUT="/src/$OUT" \
    "$IMAGE" \
    bash -c 'echo "GNOME Shell in container: $(gnome-shell --version)"
             # GNOME Shell needs a system bus (e.g. for the login manager).
             mkdir -p /run/dbus && dbus-daemon --system --fork
             tools/screenshots/run.sh "build/$1.shell-extension.zip" "$1"' _ "$UUID"
