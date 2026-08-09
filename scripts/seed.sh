#!/usr/bin/env bash
# DJ-TECH demo-data seeder for Linux/Unix.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> Seeding demo data"
if command -v bun >/dev/null 2>&1; then
  bun run seed
else
  npm run seed
fi
