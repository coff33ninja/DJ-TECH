#!/usr/bin/env bash
# DJ-TECH production run for Linux/Unix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [[ ! -f dist/server.cjs ]]; then
  echo "==> No build found, building first..."
  "$SCRIPT_DIR/build.sh"
fi

echo "==> Starting DJ-TECH on http://localhost:${PORT:-3000}"
echo "    Press Ctrl+C to stop."
exec node dist/server.cjs
