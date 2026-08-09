# Changelog

All notable changes to DJ Tech are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2026-08-09


### Changed

- **Dependency updates** - applied latest dependency versions via weekly `bun update` / Dependabot.


## [1.0.1] - 2026-08-09


### Changed

- **Dependency updates** - applied latest dependency versions via weekly `bun update` / Dependabot.


## [1.0.0] - 2026-08-09

Fresh start with a clean git history. Initial release of the complete repair-shop management system.

### Added

- **Dashboard** — revenue, outstanding, job load, and low-stock summary with a full audit trail page.
- **Customers & Devices** — customer records (individual/company, contact details, address, notes, status), per-customer device tracking with component-presence toggles and component specs, and a devices page.
- **Jobs** — job cards with timeline events, parts (from inventory) and labour lines, statuses, a public job tracking page (`/track/:code`), and PDF job-card generation.
- **Quotes & Invoices** — quotes convertible to invoices, PDF generation and email sending, payment recording, VAT and currency from settings.
- **Inventory & Purchases** — inventory with stock movements, suppliers, and purchase orders that can be tied to a customer/job and supplier.
- **Email** — IMAP/POP3 + SMTP via settings-driven config, inbox/sent sync, send/reply with signature, compose UI.
- **WhatsApp** — QR-based login through Baileys (session cached in `wa_session/`), chat/message sync, send with signature, and "create customer" straight from a thread.
- **Auto-filing** — mail and WhatsApp threads auto-classified as customer or supplier by matching number/address/domain and bucketed into Auto-Folders; manual "Re-file" re-scan.
- **Documents** — upload, attach to jobs, and send-along when sending quotes/invoices/status.
- **Settings** — business details, banking, mail, WhatsApp, VAT/currency/labour-rate configuration stored in the `settings` table (no `.env` needed).
- **Reports & Search** — reports page and global search across the data model.
- **Setup page** — guided first-run configuration; seed script with demo data.
- **Docker packaging** — multi-stage `Dockerfile` (bun build → node runtime), `.dockerignore`, and a `DATA_DIR` env override (`src/lib/paths.ts`) so `sqlite.db`, uploaded documents, and the WhatsApp session can live on a mounted volume.
- **GitHub Actions pipeline** — `ci.yml` (lint + build), `docker-build.yml` (GHCR image push on tags/main), `release.yml` (tag-verified source archive + changelog body + SHA-256), `auto-tag.yml` (dependency-only changes auto-cut PATCH releases), `jekyll-gh-pages.yml` (GitHub Pages docs from the README), `dep-maintenance.yml` (weekly dependency-update PR), and `dependabot.yml`.
- **Source-release flow** — releases ship the changelog section for that version plus `dj-tech-source-vX.Y.Z.zip` and checksum; `scripts/push-and-release.ps1` / `.sh` cut a release end-to-end and wait for the workflow.
- **Versioning rules** — `VERSIONS.md` documents the release/versioning rules (major/minor/patch auto-detection, explicit overrides, re-cut flow) driven by the `[Unreleased]` changelog section.
- **Install/run/update scripts** — `install`, `build`, `run`, `dev`, `lint`, `seed`, `update` for both Windows (`scripts/*.ps1`) and Linux/Unix (`scripts/*.sh`).
- **Jenkins** — declarative `Jenkinsfile` and a setup section in the README documenting a self-hosted CI alternative.
- **GitHub Pages** — `jekyll-gh-pages.yml` renders the README as a documentation site; `_config.yml` (hacker theme) styles it.

### Changed

- **Port config** — the server reads `PORT` from the environment (defaults to `3000`).
- **Firebase config** — the web app config is read from `VITE_FIREBASE_*` environment variables instead of a committed `firebase-applet-config.json`; the JSON is gitignored and the values ship as CI secrets.
- **README** — badges, feature list, Docker/scripts/releases sections, and update-flow docs.
- **Release automation** — `scripts/push-and-release.ps1` / `.sh` promote the `[Unreleased]` changelog section into a dated versioned section, sync `package.json` to the same version, and ship the release in one command. Bump type is auto-detected by a hybrid rule: `Breaking`/`Removed` always bumps major; otherwise the number of changelog bullet entries is counted — 1 entry bumps patch, 2+ entries bump minor. An explicit `-Bump patch|minor|major` / `BUMP=` override wins over auto-detection. A fresh empty `[Unreleased]` is left for the next cycle.
- **In-place backup restore** — uploading a backup now restores it directly into the running database (drop via SQL, no file deletion / no server restart), replacing the old stage-then-exit flow. Import upload limit raised to 512 MB with JSON error responses for oversized or invalid files.
- **Single email entry** — the business email auto-fills from the mailbox address when not set explicitly, so one email field completes setup and keeps the company address in sync.
- **WhatsApp phone normalization** — JIDs are normalized (strip `@s.whatsapp.net` and trailing `:device` ids), SA numbers are formatted (`27821234567` → `082 123 4567`), and the connected number shows correctly.
- **Human-readable chat labels** — WhatsApp chats resolve to the best available label (linked customer/supplier name → contact name → formatted phone) instead of raw JIDs.
- **Contact-name resolution with subtitle** — chats and mail matched to a customer/supplier show only the client's name as the primary label, with company/phone/email moved to a secondary subtitle line; raw JIDs and numbers are never exposed as the primary label.

### Fixed

- Import failure handling returns a readable error instead of an unparseable HTML page.

### Security

- Backup validation (`validateBackup`) runs before any restore; malformed or oversized uploads are rejected with JSON errors.
- Firebase web app config no longer committed to git — supplied via `VITE_FIREBASE_*` environment variables / CI secrets.

[1.0.2]: https://github.com/coff33ninja/DJ-TECH/releases/tag/v1.0.2
[1.0.1]: https://github.com/coff33ninja/DJ-TECH/releases/tag/v1.0.1
[1.0.0]: https://github.com/coff33ninja/DJ-TECH/releases/tag/v1.0.0
