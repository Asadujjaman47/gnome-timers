#!/usr/bin/env bash
# Starts a nested GNOME Shell (in a window) with the extension installed and
# enabled, using its own settings and data folders under build/run/. Your real
# session's settings and installed extensions are not touched, and the test
# session's timers persist between runs (delete build/run/ to start fresh).
#
# Usage: tools/run-nested.sh <extension zip> <uuid> <--devkit|--nested>
set -euo pipefail

ZIP=$(realpath "$1")
UUID=$2
FLAG=$3
RUN_DIR=$(realpath -m "$(dirname "$0")/../build/run")

mkdir -p "$RUN_DIR/data" "$RUN_DIR/config" "$RUN_DIR/cache"
export XDG_DATA_HOME=$RUN_DIR/data
export XDG_CONFIG_HOME=$RUN_DIR/config
export XDG_CACHE_HOME=$RUN_DIR/cache

exec dbus-run-session -- bash -c '
    set -e
    gnome-extensions install --force "$0"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"
    # Skip the welcome tour in the test session.
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    echo "Starting nested GNOME Shell ($2). Close its window to stop."
    exec gnome-shell "$2" --wayland
' "$ZIP" "$UUID" "$FLAG"
