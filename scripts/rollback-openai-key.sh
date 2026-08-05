#!/bin/sh
set -eu

PROJECT="/Users/qcc/moli-wechat-agent"
TARGET="$PROJECT/.env"
BACKUP="$PROJECT/.env.before-openai-20260804T160400"

if [ "${1:-}" = "--check" ]; then
  test -f "$TARGET"
  test -f "$BACKUP"
  printf 'rollback-ready target=%s backup=%s\n' "$TARGET" "$BACKUP"
  exit 0
fi

cp -p "$BACKUP" "$TARGET"
chmod 600 "$TARGET"
printf 'restored %s from %s\n' "$TARGET" "$BACKUP"
printf 'The remote moli-wechat-agent API key remains active; revoke it in the OpenAI API dashboard if remote rollback is required.\n'
