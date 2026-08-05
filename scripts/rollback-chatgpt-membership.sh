#!/bin/sh
set -eu

PROJECT="/Users/qcc/moli-wechat-agent"
ORIGINAL="$PROJECT/artifacts/chatgpt-membership-original"
ENV_BACKUP="$PROJECT/.env.before-chatgpt-membership-20260804T161500"
FILES="src/ai.js src/pipeline.js src/server.js public/app.js public/index.html .env.example package.json README.md"

if [ "${1:-}" = "--check" ]; then
  test -f "$ENV_BACKUP"
  for file in $FILES; do test -f "$ORIGINAL/$file"; done
  printf 'rollback-ready original=%s env_backup=%s\n' "$ORIGINAL" "$ENV_BACKUP"
  exit 0
fi

for file in $FILES; do
  mkdir -p "$PROJECT/$(dirname "$file")"
  cp -p "$ORIGINAL/$file" "$PROJECT/$file"
done
rm -f "$PROJECT/src/codex.js" "$PROJECT/test/codex.test.js"
cp -p "$ENV_BACKUP" "$PROJECT/.env"
chmod 600 "$PROJECT/.env"
printf 'restored pre-membership provider files and environment\n'
