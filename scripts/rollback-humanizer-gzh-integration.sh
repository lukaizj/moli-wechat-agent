#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/qcc/moli-wechat-agent"
BACKUP="$ROOT/artifacts/humanizer-gzh-integration-original"

if [[ "${1:-}" == "--check" ]]; then
  for file in \
    src/ai.js src/pipeline.js src/server.js src/article.js src/defaults.js \
    public/app.js public/index.html public/styles.css \
    package.json package-lock.json README.md state.json; do
    test -f "$BACKUP/$file"
  done
  test -f "$BACKUP/test/article.test.js.original.txt"
  printf 'rollback-ready backup=%s\n' "$BACKUP"
  exit 0
fi

for file in ai.js pipeline.js server.js article.js defaults.js; do
  install -m 0644 "$BACKUP/src/$file" "$ROOT/src/$file"
done
for file in app.js index.html styles.css; do
  install -m 0644 "$BACKUP/public/$file" "$ROOT/public/$file"
done
install -m 0644 "$BACKUP/test/article.test.js.original.txt" "$ROOT/test/article.test.js"
install -m 0644 "$BACKUP/package.json" "$ROOT/package.json"
install -m 0644 "$BACKUP/package-lock.json" "$ROOT/package-lock.json"
install -m 0644 "$BACKUP/README.md" "$ROOT/README.md"
install -m 0644 "$BACKUP/state.json" "$ROOT/data/state.json"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import shutil
import sys
root = Path(sys.argv[1])
for relative in ("src/humanizer.js", "src/gzh.js", "LICENSE", "THIRD_PARTY_NOTICES.md"):
    (root / relative).unlink(missing_ok=True)
shutil.rmtree(root / "vendor", ignore_errors=True)
PY
printf 'rollback-complete root=%s; restart the service to load restored code\n' "$ROOT"
