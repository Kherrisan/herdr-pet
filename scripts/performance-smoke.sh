#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
sample_seconds="${HERDR_PET_PERF_SECONDS:-20}"
warmup_seconds="${HERDR_PET_PERF_WARMUP_SECONDS:-3}"
scenario="${HERDR_PET_PERF_SCENARIO:-sleeping}"
fixture_root="$(mktemp -d)"
fixture_socket="$fixture_root/herdr.sock"
server_pid=""
runner_pid=""
app_pid=""

cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
  fi
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

if [[ "$scenario" != "sleeping" && "$scenario" != "idle" && "$scenario" != "working" ]]; then
  echo "HERDR_PET_PERF_SCENARIO must be sleeping, idle, or working." >&2
  exit 1
fi

descendant_pids() {
  local queue=("$1")
  local current
  local child
  while ((${#queue[@]})); do
    current="${queue[0]}"
    queue=("${queue[@]:1}")
    printf '%s\n' "$current"
    while read -r child; do
      [[ -n "$child" ]] && queue+=("$child")
    done < <(pgrep -P "$current" || true)
  done
}

tree_ticks() {
  local total=0
  local pid
  for pid in "$@"; do
    if [[ -r "/proc/$pid/stat" ]]; then
      total=$((total + $(awk '{ print $14 + $15 }' "/proc/$pid/stat")))
    fi
  done
  printf '%s\n' "$total"
}

tree_rss_kib() {
  local pids
  pids="$(descendant_pids "$1" | paste -sd, -)"
  [[ -z "$pids" ]] && { printf '0\n'; return; }
  ps -o rss= -p "$pids" | awk '{ total += $1 } END { print total + 0 }'
}

if [[ "${1:-}" == "--build" ]]; then
  cargo build --release --manifest-path "$project_root/src-tauri/Cargo.toml"
fi

if [[ ! -x "$binary_path" ]]; then
  echo "Release binary is missing. Run: npm run perf:smoke -- --build" >&2
  exit 1
fi
if ! command -v xvfb-run >/dev/null; then
  echo "xvfb-run is required for the isolated Linux smoke test." >&2
  exit 1
fi

started_ns="$(date +%s%N)"
node "$project_root/scripts/perf-fake-herdr.mjs" "$fixture_socket" "$scenario" &
server_pid=$!
for _ in {1..100}; do
  [[ -S "$fixture_socket" ]] && break
  sleep 0.02
done
if [[ ! -S "$fixture_socket" ]]; then
  echo "The performance Herdr fixture did not start." >&2
  exit 1
fi
setsid xvfb-run -a env \
  XDG_CONFIG_HOME="$fixture_root/config" \
  XDG_DATA_HOME="$fixture_root/data" \
  HERDR_SOCKET_PATH="$fixture_socket" \
  timeout "$((sample_seconds + warmup_seconds + 5))s" "$binary_path" >/dev/null 2>&1 &
runner_pid=$!

for _ in {1..100}; do
  app_pid="$(pgrep -n -f "^${binary_path}$" || true)"
  [[ -n "$app_pid" ]] && break
  sleep 0.05
done

if [[ -z "$app_pid" ]]; then
  echo "Herdr Pet did not start under Xvfb." >&2
  exit 1
fi

process_started_ns="$(date +%s%N)"
sleep "$warmup_seconds"
if ! kill -0 "$app_pid" 2>/dev/null; then
  echo "Herdr Pet exited during the warm-up period." >&2
  exit 1
fi

clock_ticks="$(getconf CLK_TCK)"
mapfile -t measured_pids < <(descendant_pids "$app_pid")
cpu_start_ticks="$(tree_ticks "${measured_pids[@]}")"
sample_started_ns="$(date +%s%N)"
sleep "$sample_seconds" &
sleep_pid=$!

rss_peak_kib=0
samples=0
while kill -0 "$sleep_pid" 2>/dev/null && kill -0 "$app_pid" 2>/dev/null; do
  rss="$(tree_rss_kib "$app_pid")"
  rss_peak_kib=$(( rss > rss_peak_kib ? rss : rss_peak_kib ))
  samples=$((samples + 1))
  sleep 1
done
kill "$sleep_pid" 2>/dev/null || true
wait "$sleep_pid" 2>/dev/null || true

sample_ended_ns="$(date +%s%N)"
cpu_end_ticks="$(tree_ticks "${measured_pids[@]}")"
cpu_average="$(awk -v ticks="$((cpu_end_ticks - cpu_start_ticks))" -v hz="$clock_ticks" -v elapsed_ns="$((sample_ended_ns - sample_started_ns))" 'BEGIN { if (elapsed_ns <= 0) print "0.00"; else printf "%.2f", (ticks / hz) / (elapsed_ns / 1000000000) * 100 }')"
startup_ms=$(( (process_started_ns - started_ns) / 1000000 ))
if [[ "${HERDR_PET_PERF_DETAILS:-0}" == "1" ]]; then
  ps -o pid,ppid,comm,%cpu,rss,args -p "$(IFS=,; echo "${measured_pids[*]}")" >&2
fi
printf '{"platform":"linux-x11-xvfb","scenario":"%s","processStartedMs":%s,"warmupSeconds":%s,"sampleSeconds":%s,"samples":%s,"processCount":%s,"averageCpuPercent":%s,"peakRssKiB":%s}\n' \
  "$scenario" "$startup_ms" "$warmup_seconds" "$sample_seconds" "$samples" "${#measured_pids[@]}" "$cpu_average" "$rss_peak_kib"
