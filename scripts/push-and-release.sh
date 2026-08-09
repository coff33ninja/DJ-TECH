#!/usr/bin/env bash
# Release flow for DJ-TECH (Linux/Unix): promote the [Unreleased] changelog
# section, bump package.json, commit, tag, push, wait for the Release workflow,
# then verify the release exists.
set -euo pipefail

REPO="${REPO:-coff33ninja/DJ-TECH}"
BUMP="${BUMP:-auto}" # auto | patch | minor | major
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install from https://cli.github.com/" >&2
  exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"

# Extract the [Unreleased] section (stops at the next top-level "## [" heading).
UNRELEASED="$(awk '/^## \[Unreleased\]/{found=1; next} found && /^## \[/{exit} found{print}' CHANGELOG.md | sed '/^[[:space:]]*$/d' | sed -e :a -e '/^\n*$/{$d;N;ba}')"
if [[ -z "$UNRELEASED" ]]; then
  # Nothing pending: re-cut the current version (e.g. after deleting a release/tag).
  RECUT=1
  NEW_VERSION="$CURRENT"
  BUMP="recut"
  echo "==> [Unreleased] is empty - re-cutting $CURRENT as-is"
else
  RECUT=0
fi

# Determine bump type (hybrid rule).
if [[ "$RECUT" == "0" && "$BUMP" == "auto" ]]; then
  if grep -qE '^###[[:space:]]+(Breaking|Removed)' <<<"$UNRELEASED"; then
    BUMP="major"
  else
    # Count changelog bullet entries. 1 entry -> patch, 2+ entries -> minor.
    ENTRY_COUNT="$(grep -cE '^[[:space:]]*[-*][[:space:]]' <<<"$UNRELEASED" || true)"
    if [[ "${ENTRY_COUNT:-0}" -le 1 ]]; then
      BUMP="patch"
    else
      BUMP="minor"
    fi
  fi
fi

# Compute new version (skipped when re-cutting).
if [[ "$RECUT" == "0" ]]; then
  IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT"
  case "$BUMP" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi
TAG="v$NEW_VERSION"
DATE="$(date +%Y-%m-%d)"
echo "=== Releasing $TAG (bump: $BUMP, from $CURRENT) ==="

if [[ "$RECUT" == "0" ]]; then
  # Rewrite CHANGELOG: promote [Unreleased] to a dated version section.
  TMP="$(mktemp)"
  awk -v tag="## [$NEW_VERSION] - $DATE" '
    /^## \[Unreleased\]/ { found=1; print "## [Unreleased]\n"; print tag "\n"; next }
    found && /^## \[/ { found=0 }
    { print }
  ' CHANGELOG.md > "$TMP"
  # Add the version link reference (newest first) before the first existing link.
  if grep -qE '^\[[0-9]+\.[0-9]+\.[0-9]+\]: https://github.com/' "$TMP"; then
    sed -i "0,/^\[[0-9]+\.[0-9]+\.[0-9]+\]: https:\/\/github.com\//i\\[$NEW_VERSION]: https://github.com/$REPO/releases/tag/$TAG" "$TMP"
  else
    printf '\n[%s]: https://github.com/%s/releases/tag/%s\n' "$NEW_VERSION" "$REPO" "$TAG" >> "$TMP"
  fi
  mv "$TMP" CHANGELOG.md

  # Bump package.json.
  sed -i "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# Commit.
MSG="chore(release): $TAG"
BODY="$(awk -v tag="## [$NEW_VERSION]" 'index($0,tag)==1{f=1; next} f && /^## \[/{exit} f{print}' CHANGELOG.md)"
if [[ -n "$BODY" ]]; then
  MSG="$MSG"$'\n\n'"$BODY"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "==> Staging and committing working tree changes"
  git add -A
  git commit -m "$MSG"
else
  echo "==> Working tree clean, nothing to commit"
fi

if git tag -l "$TAG" | grep -q .; then
  echo "==> Tag $TAG already exists locally"
else
  git tag "$TAG"
fi

echo "==> Pushing commits"
git push
if git ls-remote --tags origin "$TAG" | grep -q .; then
  echo "==> Tag $TAG already on remote (auto-tag raced us), skipping tag push"
else
  echo "==> Pushing tag $TAG"
  git push origin "$TAG"
fi

echo "==> Waiting for Release workflow to finish"
RUN_ID=""
MAX_WAIT=900
ELAPSED=0
SINCE="$(date -u -d '30 seconds ago' +%Y-%m-%dT%H:%M:%SZ)"
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  RUN="$(gh run list --repo "$REPO" --workflow=Release --limit 5 --json databaseId,status,headBranch,conclusion,createdAt --jq ".[] | select(.headBranch==\"$TAG\")" 2>/dev/null || true)"
  if [[ -n "$RUN" ]]; then
    STATUS="$(printf '%s' "$RUN" | grep -o '"status":"[^"]*"' | head -1 || echo '"status":"running"')"
    echo "   $STATUS (${ELAPSED}s)"
    if printf '%s' "$STATUS" | grep -q '"completed"'; then
      CONCLUSION="$(printf '%s' "$RUN" | grep -o '"conclusion":"[^"]*"' | head -1 || echo '"conclusion":"unknown"')"
      echo "   workflow $CONCLUSION"
      if ! printf '%s' "$CONCLUSION" | grep -q '"success"'; then
        echo "Release workflow failed." >&2
        exit 1
      fi
      RUN_ID="done"
      break
    fi
  else
    echo "   waiting for trigger... (${ELAPSED}s)"
  fi
  sleep 15
  ELAPSED=$((ELAPSED + 15))
done

if [[ -z "$RUN_ID" ]]; then
  echo "Release workflow did not complete within ${MAX_WAIT}s" >&2
  exit 1
fi

echo "==> Verifying release $TAG"
gh release view "$TAG" --repo "$REPO" --json tagName,assets
echo "=== Done: https://github.com/$REPO/releases/tag/$TAG ==="
