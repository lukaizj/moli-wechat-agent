#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/qcc/moli-wechat-agent"
BACKUP="$ROOT/.env.before-deepseek-activation-20260804T164500"

if [[ "${1:-}" == "--check" ]]; then
  test -f "$BACKUP"
  test "$(stat -f '%Lp' "$BACKUP")" = "600"
  printf 'rollback-ready env_backup=%s\n' "$BACKUP"
  exit 0
fi

install -m 0600 "$BACKUP" "$ROOT/.env"
printf 'rollback-complete env=%s; restart the service to load it\n' "$ROOT/.env"
