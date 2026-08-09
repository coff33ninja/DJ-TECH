# Versioning Rules

DJ Tech follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) in the form `MAJOR.MINOR.PATCH`, driven by the contents of the `[Unreleased]` section in `CHANGELOG.md`.

## Why these rules exist

The rules below exist to avoid a **dirty release history** — overlapping releases, re-cut tags, and accumulated `chore(release)` commits piling up on `main`. Every release is cut through a single script so the flow is uniform and reproducible, and the `[Unreleased]` section drives exactly one version bump per run.

## The rules

| Bump | What triggers it | Detected from `[Unreleased]` |
|---|---|---|
| **MAJOR** (`X.0.0`) | Breaking changes: removed/reworked public APIs, schema changes that require migration, incompatible behavior changes | A `### Breaking` or `### Removed` heading |
| **MINOR** (`0.X.0`) | A few new features or a larger batch of changes | No `Breaking`/`Removed` heading and **2+ bullet entries** |
| **PATCH** (`0.0.X`) | A single small change: a bug fix, doc update, or dependency bump | No `Breaking`/`Removed` heading and **exactly 1 bullet entry** |
| **RECUT** | Re-releasing an existing version (e.g. after deleting a release/tag) | Empty `[Unreleased]` section |

## Overrides

- PowerShell: `-Bump patch`, `-Bump minor`, or `-Bump major`
- Linux/Unix: `BUMP=patch`, `BUMP=minor`, or `BUMP=major`

An explicit override always wins over auto-detection.

## Release flow

1. Add your changes as bullet entries under `## [Unreleased]` in `CHANGELOG.md`.
2. Run `scripts/push-and-release.ps1` (Windows) or `scripts/push-and-release.sh` (Linux/Unix).
3. The script:
   - promotes `[Unreleased]` into a dated `[X.Y.Z]` section,
   - auto-detects the bump type from the rules above,
   - syncs `package.json` to the new version,
   - commits, tags `vX.Y.Z`, and pushes,
   - waits for the GitHub Release workflow,
   - verifies the source archive + SHA-256 assets.
4. If `[Unreleased]` is empty, the script re-cuts the current version as-is.

## Automated dependency updates

When a dependency-only change lands on `main` — a `package.json` or `bun.lock` change with **no version bump** (e.g. the weekly `bun update` PR or a Dependabot PR) — the `auto-tag.yml` workflow applies the **dependency bump → PATCH** rule automatically:

1. It detects that the version is unchanged.
2. It adds a `### Changed / Dependency updates` entry under `[Unreleased]` if the section is empty.
3. It runs `push-and-release.sh`, which promotes the section, bumps the patch version, tags, and ships the release.

This keeps the release body accurate and the version history clean without manual intervention.

## Conventions

- One release per run; do not delete and re-cut a tag except to fix a broken release.
- Keep `[Unreleased]` empty after every release so the next version is unambiguous.
- Changelog bullets live under `### Added`, `### Changed`, `### Fixed`, `### Removed`, or `### Breaking`.
