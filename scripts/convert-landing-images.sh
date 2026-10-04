#!/usr/bin/env bash
# Disposable: converts the AI-generated PNGs in new_lp/images to WebP at display size (<= 2x slot width).
set -euo pipefail
SRC="new_lp/images"
OUT="src/assets/landing"
mkdir -p "$OUT"

pick() { ls "$SRC"/hf_*_"$1"_*.png | head -n 1; }

# name  time-id  resize  [crop]
conv() {
  local name="$1" id="$2" resize="$3" crop="${4:-}"
  local args=("$(pick "$id")")
  [[ -n "$crop" ]] && args+=(-crop "$crop" +repage)
  convert "${args[@]}" -resize "$resize" -strip -define webp:method=6 -quality 78 "$OUT/$name.webp"
}

conv turma-diversa   232114 "1040x>"
conv isa             232214 "584x>" "584x880+584+0"   # right half only (illustration panel)
conv prova-impressa  232401 "680x>"
conv perfis-celular  232413 "680x>"
conv historico       232425 "680x>"
conv justificativa   232608 "680x>"

for f in "$OUT"/*.webp; do
  printf '%s %s %s bytes\n' "$(basename "$f")" "$(identify -format '%wx%h' "$f")" "$(stat -c%s "$f")"
done
