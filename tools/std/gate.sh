#!/usr/bin/env bash
set -uo pipefail

root="$(git rev-parse --show-toplevel)" || exit 2
cd "$root" || exit 2
std='.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std'
reports="$std/reports"
label="${1:-}"
if [[ ! "$label" =~ ^[a-zA-Z0-9-]+$ ]]; then echo 'usage: gate.sh <label> [--skip-tests for dry]' >&2; exit 2; fi
if [[ "${2:-}" == '--skip-tests' && "$label" != dry ]]; then echo '--skip-tests only for dry' >&2; exit 2; fi
mkdir -p "$reports"
scratch="$(mktemp -d "$root/.std-gate.XXXXXX")" || exit 2
trap 'rm -rf -- "$scratch"' EXIT
export TMPDIR="$scratch"
report="$reports/$label-gate.md"
: > "$report"
failed=0
step=0
run() {
  step=$((step + 1))
  local title="$1"; shift
  if "$@" > "$scratch/step-$step.log" 2>&1; then
    if [[ "$title" == pt-scan ]] && grep -q '^re-baselined:' "$scratch/step-$step.log"; then
      printf 'PASS %02d %s (%s)\n' "$step" "$title" "$(grep '^re-baselined:' "$scratch/step-$step.log" | tail -1)" >> "$report"
    else
      printf 'PASS %02d %s\n' "$step" "$title" >> "$report"
    fi
  else
    printf 'FAIL %02d %s\n' "$step" "$title" >> "$report"
    cat "$scratch/step-$step.log" >&2
    failed=1
  fi
}
clean_outputs() {
  git clean -fdX -- 'apps/*/dist' 'packages/*/dist' 'apps/*/.next' 'apps/*/.turbo' 'packages/*/.turbo' '.turbo'
}
run clean clean_outputs
run install pnpm install
run typecheck pnpm typecheck
run build pnpm turbo run build '--filter=!@pipe/crm'

test_log="$scratch/tests.log"
test_suite() {
  if [[ "${2:-}" == '--skip-tests' ]]; then echo 'dry skip'; return 0; fi
  local suite_rc=0
  pnpm turbo run test --continue > "$test_log" 2>&1 || suite_rc=$?
  if (( suite_rc != 0 )); then
    # Flaky paths resolve through applied|verified map rows in test-counts.ts.
    node tools/std/test-counts.ts --check-flaky --log "$test_log" --map "$std/map" || { cat "$test_log"; return 1; }
  fi
  local file api_package
  api_package="$(node tools/std/test-counts.ts --api-package --map "$std/map")" || return 1
  while IFS= read -r file; do
    pnpm --filter "$api_package" exec vitest run "$file" || return 1
  done < <(node tools/std/test-counts.ts --list-flaky --map "$std/map")
  if (( suite_rc != 0 )); then printf 'verified\n' > "$scratch/flaky-verified"; fi
  return 0
}
run tests test_suite "$label" "${2:-}"
count_tests() {
  if [[ "${2:-}" == '--skip-tests' ]]; then return 0; fi
  local args=(--log "$test_log" --out "$reports/$label-test-counts.json")
  if [[ -f "$scratch/flaky-verified" ]]; then args+=(--accept-flaky --map "$std/map"); fi
  if [[ "$label" == baseline ]]; then args+=(--baseline-md "$std/baseline.md"); fi
  if [[ "$label" != baseline ]]; then args+=(--compare "$reports/baseline-test-counts.json" --map "$std/map"); fi
  node tools/std/test-counts.ts "${args[@]}"
}
run test-counts count_tests "$label" "${2:-}"
run ddl bash tools/std/ddl-snapshot.sh check
routes() {
  local args=(--emit "$reports/$label-routes.json" --consumers "$reports/$label-route-consumers.csv" --allow "$std/route-drift-allow.csv" --check)
  if [[ "$label" != baseline ]]; then args+=(--compare "$reports/baseline-routes.json" --map "$std/map"); fi
  node tools/std/route-match.ts "${args[@]}"
}
run routes routes
scan_trend() {
  local args=(--out "$reports/$label-scan.csv" --summary "$reports/$label-scan-summary.md" --map "$std/map")
  if [[ -f "$reports/gate2-lexicon.txt" ]]; then args+=(--lexicon-file "$reports/gate2-lexicon.txt"); fi
  node tools/std/scan-pt.ts "${args[@]}" || return 1
  local summary="$reports/$label-scan-summary.md" lexicon current prior='' prior_count=''
  lexicon="$(sed -n 's/^Lexicon: //p' "$summary" | head -1)"
  current="$(sed -n 's/^Unclassified: //p' "$summary" | head -1)"
  [[ -n "$lexicon" && "$current" =~ ^[0-9]+$ ]] || return 1
  if [[ -f "$reports/gate-order.txt" ]]; then
    while IFS= read -r previous; do
      [[ "$previous" == "$label" || ! -f "$reports/$previous-scan-summary.md" ]] && continue
      if [[ "$(sed -n 's/^Lexicon: //p' "$reports/$previous-scan-summary.md" | head -1)" == "$lexicon" ]]; then
        prior="$previous"
        prior_count="$(sed -n 's/^Unclassified: //p' "$reports/$previous-scan-summary.md" | head -1)"
      fi
    done < "$reports/gate-order.txt"
  fi
  if [[ -z "$prior" ]]; then
    case "$label" in baseline|slice-0) echo "re-baselined: lexicon $lexicon" ;; *) echo 'lexicon changed outside gate 2'; return 1 ;; esac
  elif (( current > prior_count )); then
    echo "unclassified rose from $prior_count ($prior) to $current"; return 1
  fi
}
run pt-scan scan_trend
js_specifiers() {
  local dirs=() app app_dir dir rg_rc=0
  for app in api workers ponte; do
    app_dir="$(node tools/std/test-counts.ts --resolve-path "apps/$app" --map "$std/map")" || return 1
    dirs+=("$app_dir/src" "$app_dir/tests")
  done
  for dir in packages/*/src; do [[ "$dir" == packages/ui/src ]] || dirs+=("$dir"); done
  for dir in "${dirs[@]}"; do [[ -d "$dir" ]] || { echo "missing source dir: $dir"; return 1; }; done
  local count baseline
  rg -n --pcre2 "from '\\.{1,2}/[^']*(?<!\\.js)'" "${dirs[@]}" > "$scratch/js-specifiers.txt" || rg_rc=$?
  (( rg_rc <= 1 )) || return 1
  count="$(wc -l < "$scratch/js-specifiers.txt" | tr -d '[:space:]')"
  if [[ "$label" == baseline ]]; then printf '%s\n' "$count" > "$reports/baseline-js-specifiers.txt"; fi
  baseline="$(cat "$reports/baseline-js-specifiers.txt")"
  [[ "$count" =~ ^[0-9]+$ && "$baseline" =~ ^[0-9]+$ ]] || return 1
  (( count <= baseline )) || { echo "js specifiers: $count > $baseline"; return 1; }
}
run js-specifiers js_specifiers
run jsonb-keys node tools/std/jsonb-keys.ts --check
if (( failed == 0 )); then
  if [[ ! -f "$reports/gate-order.txt" ]] || ! grep -Fxq "$label" "$reports/gate-order.txt"; then printf '%s\n' "$label" >> "$reports/gate-order.txt"; fi
fi
cat "$report"
exit "$failed"
