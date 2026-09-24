#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: tools/std/codex-run.sh <account 1|2> <schema.json> <prompt.md> <out.json> [job]" >&2
}

if (( $# < 4 || $# > 5 )); then
  usage
  exit 2
fi

ACCOUNT="$1"
case "$ACCOUNT" in
  1) ACCOUNT_HOME="$HOME/.codex" ;;
  2) ACCOUNT_HOME="$HOME/.codex-conta2" ;;
  *) echo "account must be 1 or 2" >&2; exit 2 ;;
esac

real_file() {
  local value="$1"
  local directory
  directory=$(cd "$(dirname "$value")" && pwd -P)
  printf '%s/%s\n' "$directory" "$(basename "$value")"
}

real_output() {
  local value="$1"
  local directory
  mkdir -p "$(dirname "$value")"
  directory=$(cd "$(dirname "$value")" && pwd -P)
  printf '%s/%s\n' "$directory" "$(basename "$value")"
}

SCHEMA=$(real_file "$2")
PROMPT=$(real_file "$3")
OUT=$(real_output "$4")
if [[ ! -f "$SCHEMA" || ! -f "$PROMPT" ]]; then
  echo "schema and prompt must be existing files" >&2
  exit 2
fi

if (( $# == 5 )); then
  JOB="$5"
else
  JOB=$(basename "$OUT" .json)
  JOB=$(printf '%s' "$JOB" | sed -E 's/-[0-9]{3}$//')
fi
if [[ ! "$JOB" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "job must match ^[a-z0-9][a-z0-9-]*$" >&2
  exit 2
fi

REPO=$(git rev-parse --show-toplevel)
REPO=$(cd "$REPO" && pwd -P)
STD="$REPO/.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std"
LOG="$STD/reports/codex-log-$ACCOUNT-$JOB.csv"
mkdir -p "$(dirname "$LOG")"

git -C "$REPO" worktree prune
TEMP_ROOT=$(mktemp -d)
WT="$TEMP_ROOT/codex-wt"
git -C "$REPO" worktree add --detach "$WT" HEAD >/dev/null
HEAD_SHA=$(git -C "$WT" rev-parse HEAD)
echo "Codex proposal HEAD: $HEAD_SHA"

while IFS= read -r tracked; do
  base=$(basename "$tracked")
  case "$base" in
    .env*|*.pem|*.key|*.pfx|*.p12|*.crt) rm -f -- "$WT/$tracked" ;;
  esac
done < <(git -C "$WT" ls-files)

BEFORE=$(git -C "$WT" status --porcelain --untracked-files=no)
set +e
CODEX_HOME="$ACCOUNT_HOME" codex exec -m gpt-5.6-sol -c model_reasoning_effort="medium" -s read-only -C "$WT" --ephemeral --color never --output-schema "$SCHEMA" -o "$OUT" - < "$PROMPT"
CODEX_EXIT=$?
set -e
AFTER=$(git -C "$WT" status --porcelain --untracked-files=no)

TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
printf '%s,%s,%s,%s,%s,%s,%s\n' "$TIMESTAMP" "$ACCOUNT" "$JOB" "$HEAD_SHA" "$PROMPT" "$OUT" "$CODEX_EXIT" >> "$LOG"

if [[ "$BEFORE" != "$AFTER" ]]; then
  echo "CODEX CHANGED THE WORKTREE: $WT" >&2
  diff -u <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$AFTER") || true
  exit 3
fi

git -C "$REPO" worktree remove --force "$WT"
rmdir "$TEMP_ROOT" 2>/dev/null || true
exit "$CODEX_EXIT"
