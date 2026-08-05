#!/bin/sh
set -eu

PROJECT="/Users/qcc/moli-wechat-agent"
TARGET="$PROJECT/.env"
BACKUP="$PROJECT/.env.before-wechat-20260804T155500"

if [ "${1:-}" = "--check" ]; then
  test -f "$TARGET"
  test -f "$BACKUP"
  printf 'rollback-ready target=%s backup=%s\n' "$TARGET" "$BACKUP"
  exit 0
fi

cp -p "$BACKUP" "$TARGET"
chmod 600 "$TARGET"
printf 'restored %s from %s\n' "$TARGET" "$BACKUP"
printf 'Remote AppSecret and API IP whitelist remain enabled; manage them in the WeChat developer console if remote rollback is required.\n'
