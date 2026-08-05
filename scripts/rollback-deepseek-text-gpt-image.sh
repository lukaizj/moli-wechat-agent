#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/qcc/moli-wechat-agent"
BACKUP="$ROOT/artifacts/deepseek-text-gpt-image-original"
ENV_BACKUP="$ROOT/.env.before-deepseek-text-gpt-image-20260804T163500"

if [[ "${1:-}" == "--check" ]]; then
  test -f "$BACKUP/src/ai.js"
  test -f "$BACKUP/src/server.js"
  test -f "$BACKUP/src/pipeline.js"
  test -f "$BACKUP/public/app.js"
  test -f "$BACKUP/public/index.html"
  test -f "$BACKUP/env.example"
  test -f "$BACKUP/README.md"
  test -f "$BACKUP/codex.test.js.original.txt"
  test -f "$ENV_BACKUP"
  printf 'rollback-ready backup=%s env_backup=%s\n' "$BACKUP" "$ENV_BACKUP"
  exit 0
fi

install -m 0644 "$BACKUP/src/ai.js" "$ROOT/src/ai.js"
install -m 0644 "$BACKUP/src/server.js" "$ROOT/src/server.js"
install -m 0644 "$BACKUP/src/pipeline.js" "$ROOT/src/pipeline.js"
install -m 0644 "$BACKUP/public/app.js" "$ROOT/public/app.js"
install -m 0644 "$BACKUP/public/index.html" "$ROOT/public/index.html"
install -m 0644 "$BACKUP/env.example" "$ROOT/.env.example"
install -m 0644 "$BACKUP/README.md" "$ROOT/README.md"
install -m 0644 "$BACKUP/codex.test.js.original.txt" "$ROOT/test/codex.test.js"
install -m 0600 "$ENV_BACKUP" "$ROOT/.env"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
for relative in ("src/deepseek.js", "test/deepseek.test.js"):
    (root / relative).unlink(missing_ok=True)
PY
printf 'rollback-complete root=%s\n' "$ROOT"
