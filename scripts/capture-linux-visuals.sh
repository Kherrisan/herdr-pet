#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
output_root="$project_root/plans/visual-baseline/linux-x11"
fixture_root="$(mktemp -d)"
xvfb_pid=""
wm_pid=""
app_pid=""
server_pid=""

cleanup_app() {
  [[ -n "$app_pid" ]] && kill "$app_pid" 2>/dev/null || true
  [[ -n "$server_pid" ]] && kill "$server_pid" 2>/dev/null || true
  [[ -n "$app_pid" ]] && wait "$app_pid" 2>/dev/null || true
  [[ -n "$server_pid" ]] && wait "$server_pid" 2>/dev/null || true
  app_pid=""
  server_pid=""
}

cleanup() {
  cleanup_app
  [[ -n "$wm_pid" ]] && kill "$wm_pid" 2>/dev/null || true
  [[ -n "$wm_pid" ]] && wait "$wm_pid" 2>/dev/null || true
  [[ -n "$xvfb_pid" ]] && kill "$xvfb_pid" 2>/dev/null || true
  [[ -n "$xvfb_pid" ]] && wait "$xvfb_pid" 2>/dev/null || true
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT

for command in Xvfb openbox xdpyinfo xdotool xwininfo xprop import identify montage; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done
[[ -x "$binary_path" ]] || { echo "Build the Release binary before capturing visuals." >&2; exit 1; }
mkdir -p "$output_root"

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

wait_for_window() {
  local title="$1"
  local minimum_width="$2"
  local maximum_width="${3:-99999}"
  local window_id
  for _ in {1..160}; do
    while read -r window_id; do
      [[ -n "$window_id" ]] || continue
      eval "$(xdotool getwindowgeometry --shell "$window_id" 2>/dev/null || true)"
      if [[ "${WIDTH:-0}" -ge "$minimum_width" && "${WIDTH:-0}" -le "$maximum_width" ]]; then
        printf '%s\n' "$window_id"
        return
      fi
    done < <(xdotool search --all --name "$title" 2>/dev/null || true)
    sleep 0.05
  done
  return 1
}

window_map_state() {
  xwininfo -id "$1" 2>/dev/null | sed -n 's/^[[:space:]]*Map State: //p'
}

capture_window() {
  local window_id="$1"
  local target="$2"
  eval "$(xdotool getwindowgeometry --shell "$window_id")"
  import -display "$DISPLAY" -window root -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$target"
  local geometry
  local colors
  geometry="$(identify -format '%wx%h' "$target")"
  colors="$(identify -format '%k' "$target")"
  [[ "$geometry" == "320x320" || "$target" == *settings.png ]] || {
    echo "Unexpected overlay geometry $geometry for $target." >&2
    return 1
  }
  ((colors > 8)) || { echo "Visual capture $target appears blank." >&2; return 1; }
  printf '%s %s colors=%s\n' "$target" "$geometry" "$colors"
}

capture_scenario() {
  local scenario="$1"
  local file_name="$2"
  local config_root="$fixture_root/$scenario/config"
  local data_root="$fixture_root/$scenario/data"
  local scenario_root="$fixture_root/$scenario"
  local socket_path="$fixture_root/$scenario/herdr.sock"
  mkdir -p "$config_root/dev.herdr.pet" "$data_root" "$(dirname "$socket_path")"
  printf '%s\n' '{"schemaVersion":2,"desktop":{"paused":true,"toggleShortcut":"Alt+Shift+F12"}}' >"$config_root/dev.herdr.pet/config.json"

  local socket_env="herdr.sock"
  if [[ "$scenario" == "offline" ]]; then
    socket_env="missing.sock"
  else
    node "$project_root/scripts/perf-fake-herdr.mjs" "$socket_path" "$scenario" &
    server_pid=$!
    for _ in {1..100}; do
      [[ -S "$socket_path" ]] && break
      sleep 0.02
    done
    [[ -S "$socket_path" ]] || { echo "Fake Herdr failed for $scenario." >&2; return 1; }
  fi

  local launch_args=()
  [[ "$scenario" == "sleeping" ]] && launch_args+=(--settings)
  (cd "$scenario_root" && exec env \
    XDG_CONFIG_HOME="$config_root" XDG_DATA_HOME="$data_root" HERDR_SOCKET_PATH="$socket_env" \
    GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    "$binary_path" "${launch_args[@]}") >"$fixture_root/$scenario/app.log" 2>&1 &
  app_pid=$!
  local overlay
  overlay="$(wait_for_window 'Herdr Pet' 300 400)" || {
    echo "Overlay did not appear for $scenario." >&2
    while read -r candidate; do
      printf 'window %s: ' "$candidate" >&2
      xdotool getwindowname "$candidate" >&2 || true
      xdotool getwindowgeometry "$candidate" >&2 || true
    done < <(xdotool search --all --name '.*' 2>/dev/null || true)
    sed -n '1,120p' "$fixture_root/$scenario/app.log" >&2
    return 1
  }
  [[ "$(xprop -id "$overlay" _NET_WM_STATE 2>/dev/null)" == *"_NET_WM_STATE_ABOVE"* ]] || {
    echo "Overlay is not marked above other X11 windows for $scenario." >&2
    return 1
  }
  if [[ "$scenario" == "completion" ]]; then sleep 1.4; else sleep 1.5; fi
  capture_window "$overlay" "$output_root/$file_name.png"

  if [[ "$scenario" == "sleeping" ]]; then
    local settings
    settings="$(wait_for_window 'Herdr Pet 设置' 500)" || { echo "Settings window did not open." >&2; return 1; }
    xdotool windowminimize "$overlay"
    sleep 0.8
    capture_window "$settings" "$output_root/settings.png"
    xdotool windowmap "$overlay"
    sleep 0.2
    xdotool key alt+shift+F12
    for _ in {1..100}; do
      [[ "$(window_map_state "$overlay")" == "IsUnMapped" ]] && break
      sleep 0.03
    done
    [[ "$(window_map_state "$overlay")" == "IsUnMapped" ]] || {
      echo "Configured global shortcut did not hide the overlay." >&2
      return 1
    }
    xdotool key alt+shift+F12
    for _ in {1..100}; do
      [[ "$(window_map_state "$overlay")" == "IsViewable" ]] && break
      sleep 0.03
    done
    [[ "$(window_map_state "$overlay")" == "IsViewable" ]] || {
      echo "Configured global shortcut did not restore the overlay." >&2
      return 1
    }
    echo "Configured global shortcut Alt+Shift+F12 hid and restored the overlay."
  fi
  cleanup_app
}

capture_scenario sleeping sleeping
capture_scenario idle idle
capture_scenario working working
capture_scenario blocked needs-attention
capture_scenario offline offline
capture_scenario completion celebrate

montage \
  "$output_root/sleeping.png" \
  "$output_root/idle.png" \
  "$output_root/working.png" \
  "$output_root/needs-attention.png" \
  "$output_root/offline.png" \
  "$output_root/celebrate.png" \
  -tile 3x2 -geometry '320x320+12+32' -background '#202124' \
  "$output_root/contact-sheet.png"

sha256sum "$output_root"/*.png
