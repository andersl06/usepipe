#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
STD_DIR="$REPO_ROOT/.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std"
BASELINE="$STD_DIR/ddl-before.sql"

export_ddl() {
  (cd "$REPO_ROOT/packages/db" && pnpm exec drizzle-kit export) \
    | grep -v '^[[:space:]]*$' \
    | sort
}

case "${1:-}" in
  save)
    mkdir -p "$STD_DIR"
    export_ddl > "$BASELINE"
    ;;
  check)
    scratch_dir="$(mktemp -d)"
    current="$scratch_dir/current.sql"
    trap 'rm -f -- "$current"; rmdir -- "$scratch_dir"' EXIT
    export_ddl > "$current"
    if ! diff --strip-trailing-cr -u "$BASELINE" "$current"; then
      echo "DDL CHANGED" >&2
      exit 1
    fi
    if ! git -C "$REPO_ROOT" diff --quiet limpeza -- packages/db/drizzle; then
      echo "MIGRATIONS CHANGED" >&2
      exit 1
    fi
    echo "SQL unchanged"
    ;;
  *)
    echo "Uso: $0 save|check" >&2
    exit 2
    ;;
esac
