#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
fixture_root="$(mktemp -d)"
report_path="$fixture_root/runtime-self-test.json"
xvfb_pid=""
wm_pid=""

cleanup() {
  [[ -n "$wm_pid" ]] && kill "$wm_pid" 2>/dev/null || true
  [[ -n "$wm_pid" ]] && wait "$wm_pid" 2>/dev/null || true
  [[ -n "$xvfb_pid" ]] && kill "$xvfb_pid" 2>/dev/null || true
  [[ -n "$xvfb_pid" ]] && wait "$xvfb_pid" 2>/dev/null || true
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT

if [[ "${1:-}" == "--build" ]]; then
  (cd "$project_root" && npm run tauri build -- --no-bundle)
fi
[[ -x "$binary_path" ]] || { echo "Release binary is missing. Run: npm run runtime:self-test:linux -- --build" >&2; exit 1; }
for command in Xvfb openbox xdpyinfo; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done

display_number=""
for candidate in {90..120}; do
  if [[ ! -e "/tmp/.X11-unix/X$candidate" ]]; then
    display_number="$candidate"
    break
  fi
done
[[ -n "$display_number" ]] || { echo "No free X11 display was found." >&2; exit 1; }
export DISPLAY=":$display_number"
Xvfb "$DISPLAY" -screen 0 1280x1024x24 -nolisten tcp >"$fixture_root/xvfb.log" 2>&1 &
xvfb_pid=$!
for _ in {1..100}; do
  xdpyinfo >/dev/null 2>&1 && break
  sleep 0.05
done
xdpyinfo >/dev/null 2>&1 || { echo "Xvfb did not become ready." >&2; exit 1; }
openbox --sm-disable >"$fixture_root/openbox.log" 2>&1 &
wm_pid=$!
sleep 0.3

env \
  XDG_CONFIG_HOME="$fixture_root/config" \
  XDG_DATA_HOME="$fixture_root/data" \
  HERDR_SOCKET_PATH="$fixture_root/missing-herdr.sock" \
  GDK_BACKEND=x11 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  timeout 20s "$binary_path" --runtime-self-test "$report_path"

node "$project_root/scripts/check-runtime-self-test.mjs" "$report_path"
