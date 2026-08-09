#!/usr/bin/env bash
# DJ-TECH dev server (Vite + Express, hot reload) for Linux/Unix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> Starting dev server (Vite + Express, hot reload)"
if command -v bun >/dev/null 2>&1; then
  bun run dev
else
  npm run dev
fi
