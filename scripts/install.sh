#!/usr/bin/env bash
# DJ-TECH installer for Linux/Unix.
set -euo pipefail

REPO="https://github.com/coff33ninja/DJ-TECH"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/dj-tech}"
UPDATE="${1:-}"

echo "==> DJ-TECH installer"
echo

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run DJ-TECH. Install from: https://nodejs.org/" >&2
  exit 1
fi

# Check / install Bun
if ! command -v bun >/dev/null 2>&1; then
  echo "==> Bun not found. Installing Bun..."
  if ! curl -fsSL https://bun.sh/install | bash; then
    echo "==> Bun install failed. Falling back to npm (run 'npm install')." >&2
    BUN=""
  else
    export PATH="$HOME/.bun/bin:$PATH"
    BUN="$(command -v bun || true)"
    echo "==> Bun installed: $BUN"
  fi
else
  BUN="$(command -v bun)"
fi

mkdir -p "$INSTALL_DIR"

if [[ -d "$INSTALL_DIR/.git" && "$UPDATE" == "update" ]]; then
  echo "==> Pulling latest from $REPO"
  git -C "$INSTALL_DIR" pull --ff-only
elif [[ ! -d "$INSTALL_DIR/.git" ]]; then
  echo "==> Cloning $REPO into $INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ -n "${BUN:-}" ]]; then
  echo "==> Installing dependencies with bun"
  bun install --frozen-lockfile
else
  echo "==> Installing dependencies with npm"
  npm install
fi

echo
echo "DJ-TECH installed to $INSTALL_DIR"
echo "Next steps:"
echo "  cd $INSTALL_DIR"
echo "  ./scripts/run.sh        # production build + start"
echo "  ./scripts/dev.sh        # dev server with hot reload"
echo "  ./scripts/seed.sh       # optional demo data"
