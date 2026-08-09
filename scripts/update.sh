#!/usr/bin/env bash
# Update an installed DJ-TECH copy to the latest release.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/dj-tech}"

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  echo "No install found at $INSTALL_DIR. Run ./scripts/install.sh first." >&2
  exit 1
fi

echo "=== DJ-TECH update ==="
echo "Current version: $(node -p "require('$INSTALL_DIR/package.json').version")"
echo "==> Pulling latest from origin"
git -C "$INSTALL_DIR" pull --ff-only

cd "$INSTALL_DIR"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
  bun run build
else
  npm install
  npm run build
fi

echo
echo "Updated to v$(node -p "require('$INSTALL_DIR/package.json').version")"
echo "Changelog: $INSTALL_DIR/CHANGELOG.md"
echo "Restart with: ./scripts/run.sh"
