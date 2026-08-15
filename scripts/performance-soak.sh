#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binary_path="$project_root/src-tauri/target/release/herdr-pet"
duration_seconds="${HERDR_PET_SOAK_SECONDS:-28800}"
interval_seconds="${HERDR_PET_SOAK_INTERVAL_SECONDS:-60}"
warmup_seconds="${HERDR_PET_SOAK_WARMUP_SECONDS:-60}"
max_slope_kib_per_hour="${HERDR_PET_SOAK_MAX_SLOPE_KIB_PER_HOUR:-2048}"
scenario="${HERDR_PET_PERF_SCENARIO:-working}"
fixture_root="$(mktemp -d)"
fixture_socket="$fixture_root/herdr.sock"
samples_path="$fixture_root/samples.csv"
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

if [[ ! -x "$binary_path" ]]; then
  echo "Release binary is missing. Run npm run tauri build -- --no-bundle first." >&2
  exit 1
fi
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

tree_rss_kib() {
  local pids
  pids="$(descendant_pids "$1" | paste -sd, -)"
  [[ -z "$pids" ]] && { printf '0\n'; return; }
  ps -o rss= -p "$pids" | awk '{ total += $1 } END { print total + 0 }'
}

node "$project_root/scripts/perf-fake-herdr.mjs" "$fixture_socket" "$scenario" &
server_pid=$!
for _ in {1..100}; do
  [[ -S "$fixture_socket" ]] && break
  sleep 0.02
done
[[ -S "$fixture_socket" ]] || { echo "The soak Herdr fixture did not start." >&2; exit 1; }

setsid xvfb-run -a env \
  XDG_CONFIG_HOME="$fixture_root/config" \
  XDG_DATA_HOME="$fixture_root/data" \
  HERDR_SOCKET_PATH="$fixture_socket" \
  timeout "$((duration_seconds + 120))s" "$binary_path" >/dev/null 2>&1 &
runner_pid=$!

for _ in {1..100}; do
  app_pid="$(pgrep -n -f "^${binary_path}$" || true)"
  [[ -n "$app_pid" ]] && break
  sleep 0.05
done
[[ -n "$app_pid" ]] || { echo "Herdr Pet did not start under Xvfb." >&2; exit 1; }

sleep "$warmup_seconds"
kill -0 "$app_pid" 2>/dev/null || { echo "Herdr Pet exited during soak warm-up." >&2; exit 1; }
started_at="$(date +%s)"
deadline=$((started_at + duration_seconds))
printf 'elapsed_seconds,rss_kib\n' >"$samples_path"
printf 'elapsed_seconds,rss_kib\n'

while (( $(date +%s) <= deadline )); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    echo "Herdr Pet exited before the soak completed." >&2
    exit 1
  fi
  now="$(date +%s)"
  elapsed=$((now - started_at))
  rss="$(tree_rss_kib "$app_pid")"
  printf '%s,%s\n' "$elapsed" "$rss" | tee -a "$samples_path"
  ((now >= deadline)) && break
  sleep "$interval_seconds"
done

read -r rss_slope summary < <(awk -F, -v scenario="$scenario" '
  NR > 1 { n += 1; sx += $1; sy += $2; sxy += $1 * $2; sxx += $1 * $1; if ($2 > peak) peak = $2 }
  END {
    denominator = n * sxx - sx * sx
    slope = denominator == 0 ? 0 : (n * sxy - sx * sy) / denominator * 3600
    printf "%.2f\t{\"scenario\":\"%s\",\"samples\":%d,\"peakRssKiB\":%d,\"rssSlopeKiBPerHour\":%.2f}\n", slope, scenario, n, peak, slope
  }
' "$samples_path")
printf '%s\n' "$summary"
if awk -v slope="$rss_slope" -v maximum="$max_slope_kib_per_hour" 'BEGIN { exit !(slope > maximum) }'; then
  echo "RSS regression slope ${rss_slope} KiB/hour exceeds ${max_slope_kib_per_hour} KiB/hour." >&2
  exit 1
fi
