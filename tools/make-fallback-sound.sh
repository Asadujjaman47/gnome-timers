#!/usr/bin/env bash
# Generates sounds/fallback.oga: a short two-note chime synthesised from sine
# waves. It is used only when the freedesktop sound theme is not installed.
# Being generated here, the sound is original work covered by the project licence.
set -euo pipefail

cd "$(dirname "$0")/.."

# note(freq, start): fundamental + two soft overtones with an exponential decay
note() {
    local f=$1 t0=$2
    echo "gte(t,$t0)*exp(-5*(t-$t0))*(0.55*sin(2*PI*$f*(t-$t0))+0.20*sin(2*PI*2*$f*(t-$t0))+0.08*sin(2*PI*3*$f*(t-$t0)))"
}

EXPR="0.6*($(note 880 0)+$(note 1318.51 0.16))"

ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "aevalsrc='${EXPR}':s=48000:d=1.3" \
    -af "afade=t=out:st=1.1:d=0.2" \
    -ac 1 -c:a libvorbis -q:a 4 \
    sounds/fallback.oga

echo "Wrote sounds/fallback.oga"
