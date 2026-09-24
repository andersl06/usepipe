#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d "$PWD/.std-gate-test.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

# Exercise the same functions the gate invokes, with scan output supplied by a stub.
eval "$(sed -n '/^clean_outputs() {/,/^}/p' tools/std/gate.sh)"
eval "$(sed -n '/^scan_trend() {/,/^}/p' tools/std/gate.sh)"

mkdir -p apps/api/dist
printf 'stale\n' > apps/api/dist/.std-stale-test
clean_outputs > /dev/null
test ! -e apps/api/dist/.std-stale-test
clean_outputs > /dev/null
echo 'PASS stale dist removed; cleanup idempotent'

reports="$scratch/reports"
std="$scratch/std"
mkdir -p "$reports" "$std"
printf 'baseline\n' > "$reports/gate-order.txt"
printf 'Lexicon: original\nUnclassified: 10\n' > "$reports/baseline-scan-summary.md"
node() {
  local summary=''
  while (( $# )); do
    if [[ "$1" == --summary ]]; then summary="$2"; break; fi
    shift
  done
  printf 'Lexicon: %s\nUnclassified: %s\n' "$TEST_LEXICON" "$TEST_COUNT" > "$summary"
}

label=slice-1 TEST_LEXICON=changed TEST_COUNT=1
if scan_trend > /dev/null; then echo 'FAIL changed lexicon accepted' >&2; exit 1; fi
label=slice-1 TEST_LEXICON=original TEST_COUNT=11
if scan_trend > /dev/null; then echo 'FAIL rising PT count accepted' >&2; exit 1; fi
label=slice-1 TEST_LEXICON=original TEST_COUNT=10
scan_trend > /dev/null
echo 'PASS lexicon mismatch and rising count rejected; equal count accepted'
