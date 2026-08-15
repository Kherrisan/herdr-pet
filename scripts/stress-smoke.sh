#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
fixture_root="$(mktemp -d)"
fixture_socket="$fixture_root/herdr.sock"
app_log="$fixture_root/herdr-pet.log"
server_pid=""
runner_pid=""
app_pid=""

cleanup() {
  [[ -n "$app_pid" ]] && kill "$app_pid" 2>/dev/null || true
  if [[ -n "$runner_pid" ]]; then
    kill -- "-$runner_pid" 2>/dev/null || true
    wait "$runner_pid" 2>/dev/null || true
  fi
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT

if [[ "${1:-}" == "--build" ]]; then
  cargo build --release --manifest-path "$project_root/src-tauri/Cargo.toml"
fi
[[ -x "$binary_path" ]] || { echo "Release binary is missing. Run: npm run stress:linux -- --build" >&2; exit 1; }
command -v xvfb-run >/dev/null || { echo "xvfb-run is required." >&2; exit 1; }

node "$project_root/scripts/perf-fake-herdr.mjs" "$fixture_socket" stress &
server_pid=$!
for _ in {1..100}; do
  [[ -S "$fixture_socket" ]] && break
  sleep 0.02
done
[[ -S "$fixture_socket" ]] || { echo "The stress Herdr fixture did not start." >&2; exit 1; }

setsid xvfb-run -a env \
  XDG_CONFIG_HOME="$fixture_root/config" \
  XDG_DATA_HOME="$fixture_root/data" \
  HERDR_SOCKET_PATH="$fixture_socket" \
  RUST_LOG="herdr_pet_lib=info" \
  timeout 25s "$binary_path" >"$app_log" 2>&1 &
runner_pid=$!

for _ in {1..120}; do
  app_pid="$(pgrep -n -f "^${binary_path}$" || true)"
  [[ -n "$app_pid" ]] && break
  sleep 0.05
done
[[ -n "$app_pid" ]] || { sed -n '1,160p' "$app_log" >&2; echo "Herdr Pet did not start." >&2; exit 1; }

for _ in {1..300}; do
  connections="$(rg -c "connected to Herdr" "$app_log" || true)"
  events="$(rg -c "received pane.agent_status_changed" "$app_log" || true)"
  blocked="$(rg -c "status=Blocked" "$app_log" || true)"
  if (( ${connections:-0} >= 2 && ${events:-0} >= 201 && ${blocked:-0} >= 1 )); then
    break
  fi
  sleep 0.05
done

kill -0 "$app_pid" 2>/dev/null || { sed -n '1,200p' "$app_log" >&2; echo "Herdr Pet exited during stress." >&2; exit 1; }
connections="$(rg -c "connected to Herdr" "$app_log" || true)"
events="$(rg -c "received pane.agent_status_changed" "$app_log" || true)"
blocked="$(rg -c "status=Blocked" "$app_log" || true)"
disconnects="$(rg -c "Herdr subscription closed" "$app_log" || true)"

if (( ${connections:-0} < 2 )); then
  sed -n '1,240p' "$app_log" >&2
  echo "Herdr Pet did not reconnect after the forced disconnect." >&2
  exit 1
fi
if (( ${events:-0} < 201 || ${blocked:-0} < 1 )); then
  sed -n '1,240p' "$app_log" >&2
  echo "Herdr Pet did not process the complete stress sequence." >&2
  exit 1
fi

printf '{"agents":10,"completionTransitions":100,"statusEvents":%s,"blockedEvents":%s,"connections":%s,"forcedDisconnects":%s,"appAlive":true}\n' \
  "$events" "$blocked" "$connections" "$disconnects"
