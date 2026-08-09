#!/usr/bin/env bash
# DJ-TECH typecheck (tsc --noEmit) for Linux/Unix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> Running typecheck (tsc --noEmit)"
if command -v bun >/dev/null 2>&1; then
  bun run lint
else
  npm run lint
fi
echo "Lint OK."
