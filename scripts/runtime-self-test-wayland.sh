#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
fixture_root="$(mktemp -d)"
runtime_root="$fixture_root/runtime"
report_path="$fixture_root/runtime-self-test.json"
socket_name="herdr-pet-wayland"
weston_pid=""

cleanup() {
  [[ -n "$weston_pid" ]] && kill "$weston_pid" 2>/dev/null || true
  [[ -n "$weston_pid" ]] && wait "$weston_pid" 2>/dev/null || true
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT

if [[ "${1:-}" == "--build" ]]; then
  (cd "$project_root" && npm run tauri build -- --no-bundle)
fi
[[ -x "$binary_path" ]] || { echo "Release binary is missing. Run: npm run runtime:self-test:wayland -- --build" >&2; exit 1; }
command -v weston >/dev/null || { echo "weston is required." >&2; exit 1; }

mkdir -p "$runtime_root"
chmod 700 "$runtime_root"
XDG_RUNTIME_DIR="$runtime_root" weston \
  --backend=headless --renderer=pixman --width=1280 --height=1024 \
  --socket="$socket_name" --idle-time=0 --no-config \
  --log="$fixture_root/weston.log" &
weston_pid=$!
for _ in {1..100}; do
  [[ -S "$runtime_root/$socket_name" ]] && break
  sleep 0.05
done
if [[ ! -S "$runtime_root/$socket_name" ]]; then
  sed -n '1,160p' "$fixture_root/weston.log" >&2
  echo "Weston headless did not become ready." >&2
  exit 1
fi

env -u DISPLAY \
  XDG_RUNTIME_DIR="$runtime_root" \
  XDG_CONFIG_HOME="$fixture_root/config" \
  XDG_DATA_HOME="$fixture_root/data" \
  XDG_SESSION_TYPE=wayland \
  WAYLAND_DISPLAY="$socket_name" \
  GDK_BACKEND=wayland \
  HERDR_SOCKET_PATH="$fixture_root/missing-herdr.sock" \
  LIBGL_ALWAYS_SOFTWARE=1 \
  WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  timeout 20s "$binary_path" --runtime-self-test "$report_path"

node "$project_root/scripts/check-runtime-self-test.mjs" "$report_path"
