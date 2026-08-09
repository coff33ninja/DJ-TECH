#!/usr/bin/env bash
# DJ-TECH production build for Linux/Unix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

VER="$(node -p "require('./package.json').version")"
echo "=== DJ-TECH build ==="
echo "Version: $VER"

if command -v bun >/dev/null 2>&1; then
  echo "==> Building with bun"
  bun run build
else
  echo "==> Building with npm"
  npm run build
fi

echo "OK: dist/server.cjs"
