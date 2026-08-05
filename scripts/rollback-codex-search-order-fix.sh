#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/qcc/moli-wechat-agent"
PATCH="$ROOT/artifacts/codex-search-order-fix.patch"

if [[ "${1:-}" == "--check" ]]; then
  test -f "$PATCH"
  git -C "$ROOT" apply --check --reverse "$PATCH"
  printf 'rollback-ready reverse_patch=%s\n' "$PATCH"
  exit 0
fi

git -C "$ROOT" apply --check --reverse "$PATCH"
git -C "$ROOT" apply --reverse "$PATCH"
printf 'rollback-complete reverse_patch=%s\n' "$PATCH"
