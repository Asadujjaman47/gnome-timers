#!/usr/bin/env bash
# Starts a nested GNOME Shell (in a window) with the extension installed and
# enabled, using its own settings and data folders under build/run/. Your real
# session's settings and installed extensions are not touched, and the test
# session's timers persist between runs (delete build/run/ to start fresh).
#
# When the nested shell closes, every process still left from that session
# (e.g. the preferences window, portals) is stopped, so nothing keeps running
# in the background.
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

# Processes started by the nested session inherit its XDG_CONFIG_HOME.
leftover_pids() {
    local environ pid
    for environ in /proc/[0-9]*/environ; do
        pid=${environ#/proc/}
        pid=${pid%/environ}
        [[ $pid == "$$" || $pid == "$BASHPID" ]] && continue
        # Other users' and system processes cannot be read; they are not ours.
        if { tr '\0' '\n' <"$environ"; } 2>/dev/null | grep -qx "XDG_CONFIG_HOME=$XDG_CONFIG_HOME"; then
            echo "$pid"
        fi
    done
}

cleanup() {
    local pids
    mapfile -t pids < <(leftover_pids)
    [[ ${#pids[@]} -eq 0 ]] && return
    echo "Stopping ${#pids[@]} leftover process(es) from the nested session:"
    ps -o pid=,args= -p "$(IFS=,; echo "${pids[*]}")" | cut -c1-100 || true
    kill -TERM "${pids[@]}" 2>/dev/null || true
    sleep 2
    mapfile -t pids < <(leftover_pids)
    [[ ${#pids[@]} -gt 0 ]] && kill -KILL "${pids[@]}" 2>/dev/null || true
}
trap cleanup EXIT

dbus-run-session -- bash -c '
    set -e
    gnome-extensions install --force "$0"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"
    # Skip the welcome tour in the test session.
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    echo "Starting nested GNOME Shell ($2). Close its window to stop."
    exec gnome-shell "$2" --wayland
' "$ZIP" "$UUID" "$FLAG"
