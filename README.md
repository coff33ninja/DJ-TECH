# DJ Tech — Repair Shop Management System

<p align="center">
  <a href="https://github.com/coff33ninja/DJ-TECH/releases"><img src="https://img.shields.io/github/v/release/coff33ninja/DJ-TECH?logo=github&labelColor=2d333b&color=orange" alt="Release"></a>
  <a href="https://github.com/coff33ninja/DJ-TECH/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/coff33ninja/DJ-TECH/ci.yml?branch=main&logo=github&labelColor=2d333b" alt="CI"></a>
  <a href="https://github.com/coff33ninja/DJ-TECH/actions/workflows/docker-build.yml"><img src="https://img.shields.io/github/actions/workflow/status/coff33ninja/DJ-TECH/docker-build.yml?branch=main&logo=docker&labelColor=2d333b" alt="Docker"></a>
  <a href="https://github.com/coff33ninja/DJ-TECH/pkgs/container/dj-tech"><img src="https://img.shields.io/badge/ghcr.io-3C873A?logo=containerd&logoColor=white&labelColor=2d333b" alt="GHCR"></a>
  <a href="https://github.com/coff33ninja/DJ-TECH/commits/main"><img src="https://img.shields.io/github/last-commit/coff33ninja/DJ-TECH?labelColor=2d333b&color=yellowgreen" alt="Last commit"></a>
  <a href="https://github.com/coff33ninja/DJ-TECH/blob/main/CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-Keep%20a%20Changelog-blue?labelColor=2d333b" alt="Changelog"></a>
  <a href="https://coff33ninja.github.io/DJ-TECH/"><img src="https://img.shields.io/badge/docs-gh--pages-blue?labelColor=2d333b&logo=github" alt="Docs"></a>
</p>

<p align="center">
  <strong><em>Fixing your problems, one service at a time.</em></strong>
</p>

A full-stack job-card, inventory, and invoicing system for an independent PC/device repair business. Built as a Google AI Studio applet (Vite + Express + React), backed by SQLite via Drizzle ORM, with WhatsApp and email inboxes wired directly into the customer workflow.

> **How this stays standing:** versioned releases, an auto-tag → GitHub Release → Docker image pipeline, a changelog that ships with every release, and one-command update scripts for Windows and Linux/Unix. Jenkins (self-hosted) is covered in the [Jenkins](#jenkins) section below.

## Stack

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, Vite 6, lucide-react icons
- **Backend:** Express 4, served by the same Vite dev server in dev, bundled to `dist/server.cjs` for prod
- **Database:** SQLite (`sqlite.db`) via `@libsql/client` + Drizzle ORM
- **Messaging:** IMAP/POP3 + SMTP (`imapflow`, `node-pop3`, `nodemailer`) for email; `@whiskeysockets/baileys` for WhatsApp
- **PDF:** `pdfkit` for job cards, quotes, invoices
- **Auth:** Firebase Google Sign-In (`firebase/auth`), currently scoped only to the Tasks page (Gmail/Drive/Tasks scopes) — no app-wide login yet (see Roadmap)
- **AI:** `@google/genai` is a dependency (AI Studio injects `GEMINI_API_KEY`) but is not yet called anywhere in the code — this was the initial scaffolding tool, not a locked-in choice (see Roadmap)

## Project structure

```
server.ts                Express app — all /api routes (~2500 lines, single file)
seed.ts                  Demo data seeder
src/
  db/schema.ts            Drizzle schema — every table
  db/index.ts              libsql client, points at ./sqlite.db
  lib/paths.ts             Data-dir resolution (DATA_DIR env, Docker-friendly)
  services/
    email.ts                IMAP/POP3 sync, SMTP send, settings-driven config
    whatsapp.ts              Baileys session, chat/message sync, send
    documents.ts             Document + job-attachment storage, job-card PDF, intake sender
    billing.ts               Quote/invoice PDF generation and send
    classify.ts              Auto-tags mail/WhatsApp threads as customer or supplier
  pages/                   One file per nav section (Dashboard, Customers, Devices, Jobs, ...)
  lib/auth.ts              Firebase Google sign-in (Tasks page only)
data/documents/           Uploaded files (git-ignored)
wa_session/                Baileys auth session (git-ignored)
docs/Information.md        Original build spec this app was generated from
docs/slices.md              Build order the spec was implemented in
scripts/                   Install/build/run/dev/lint/seed/update (Windows + Unix)
Dockerfile                 Multi-stage build (bun build → node runtime, DATA_DIR volume)
Jenkinsfile                Declarative pipeline for self-hosted Jenkins
.github/workflows/         CI, Docker Build, Release, Auto Tag, GitHub Pages, dep maintenance
```

## Features

- **Job cards** — statuses, timeline events, parts (from inventory) and labour lines, public `/track/:code` page, PDF job card.
- **Quotes & invoices** — convert quote → invoice, PDF generation, email sending, payment recording, VAT and currency from settings.
- **Inventory & purchases** — stock with movements, suppliers, purchase orders traceable to a customer/job.
- **WhatsApp** — QR-based login (Baileys), chat/message sync, send with signature, "create customer" from a thread.
- **Email** — IMAP/POP3 + SMTP, inbox/sent sync, send/reply with signature.
- **Auto-filing** — mail and WhatsApp threads auto-classified as customer or supplier and bucketed into Auto-Folders.
- **Documents** — uploads, job attachments, send-along with quotes/invoices/status.
- **Backup & restore** — in-place restore from a single upload, validated before touching the DB.
- **Settings** — business details, banking, mail, WhatsApp, VAT/currency/labour rate — no `.env` needed.

## Data model

Customers → Devices → Jobs → {TimelineEvents, JobParts, JobLabour, Quotes → Invoices → Payments}. Purchases (and PurchaseItems) can be tied to a specific Customer/Job as well as to Inventory/Suppliers, so a part bought for one repair is traceable end to end. Inventory changes are logged in `stockMovements`. Mutating actions are meant to be recorded in `auditLog`. Mail and WhatsApp each get their own tables (`mailMessages`/`mailFolderState`, `whatsappChats`/`whatsappMessages`) sharing a `category`/`categoryId` classification that links a thread back to a customer or supplier.

Full schema: `src/db/schema.ts`.

## API surface

All routes are namespaced under `/api` in `server.ts`:

| Area | Routes |
|---|---|
| Customers / Devices | `/customers`, `/customers/:id`, `/customers/:customerId/devices`, `/devices` |
| Jobs | `/jobs`, `/jobs/:id`, `/jobs/:id/timeline`, `/track/:code` (public tracking link) |
| Quotes / Invoices | `/quotes`, `/quotes/:id/pdf`, `/quotes/:id/send`, `/quotes/:id/convert`, `/invoices`, `/invoices/:id/pdf`, `/invoices/:id/send`, `/invoices/:id/payments` |
| Inventory / Purchases | `/inventory`, `/inventory/:id/movements`, `/product-import` (mock), `/suppliers`, `/purchases` |
| Mail | `/mail/config`, `/mail/sync`, `/mail/messages`, `/mail/send`, `/classify` |
| WhatsApp | `/whatsapp/status`, `/whatsapp/start`, `/whatsapp/chats`, `/whatsapp/send` |
| Documents | `/documents`, `/attachments`, `/jobs/:id/attachments` |
| Misc | `/dashboard`, `/search`, `/reports`, `/settings`, `/audit` |

## Quick start (source)

Requires [Node.js](https://nodejs.org/) 20+; [Bun](https://bun.sh) is preferred and used in CI (falls back to npm):

```bash
bun install
bun run seed      # optional — populates demo customers/devices/jobs/inventory
bun run dev       # Vite + Express on the same server, hot-reloading
```

`sqlite.db` is created automatically on first run and is git-ignored — each environment keeps its own local database file. If you change `src/db/schema.ts`, push it with:

```bash
bun run db:push
bun run db:studio  # Drizzle Studio, browse the DB
```

For production:

```bash
bun run build   # vite build + esbuild bundle -> dist/server.cjs
bun run start   # run the built server
```

## Install / run scripts

One-command scripts for a source install, dev, build, and update — on both platforms.

| Task | Windows | Linux/Unix |
|---|---|---|
| Install (clone + deps) | `.\scripts\install.ps1` | `./scripts/install.sh` |
| Dev server (hot reload) | `.\scripts\dev.ps1` | `./scripts/dev.sh` |
| Production build | `.\scripts\build.ps1` | `./scripts/build.sh` |
| Production run | `.\scripts\run.ps1` | `./scripts/run.sh` |
| Typecheck | `.\scripts\lint.ps1` | `./scripts/lint.sh` |
| Seed demo data | `.\scripts\seed.ps1` | `./scripts/seed.sh` |
| Update to latest release | `.\scripts\update.ps1` | `./scripts/update.sh` |
| Cut a release (version + changelog → tag → GitHub Release) | `.\scripts\push-and-release.ps1` | `./scripts/push-and-release.sh` |

## Docker

A multi-stage `Dockerfile` builds the production bundle with bun and runs it on plain Node (no build tooling in the image). All persistent state (`sqlite.db`, uploaded documents, WhatsApp session) lives under `/data`, which is declared as a volume — set `DATA_DIR` (defaults to the working directory) anywhere the app runs.

GitHub Actions builds and pushes the image to the GitHub Container Registry on every tag and `main` push:

```bash
# pull the latest release image
docker pull ghcr.io/coff33ninja/dj-tech:main

# run with a persistent data volume
docker run -d -p 3000:3000 -v djtech-data:/data ghcr.io/coff33ninja/dj-tech:main
```

Images are tagged with the semver on releases (`ghcr.io/coff33ninja/dj-tech:v1.0.0`), plus branch/sha tags. See [.github/workflows/docker-build.yml](.github/workflows/docker-build.yml).

## Releases & updates

Every release is driven by the version in `package.json`. The pipeline keeps the changelog and the release in lockstep:

1. Bump `version` in `package.json` and add a matching `## [X.Y.Z] - YYYY-MM-DD` section to `CHANGELOG.md`.
2. Commit and push to `main`.
3. **Auto Tag** creates `vX.Y.Z` → **Release** verifies tag = version, lint + build, and publishes a GitHub Release with the changelog section as the body plus a source archive + SHA-256 → **Docker Build** pushes the matching image.
4. Installed copies update with `scripts/update.ps1` / `scripts/update.sh` (or `docker pull`).

`scripts/push-and-release.ps1` / `scripts/push-and-release.sh` do steps 1–3 in one go and wait for the Release workflow to finish.

## Jenkins

A declarative [`Jenkinsfile`](Jenkinsfile) mirrors the GitHub Actions CI for a self-hosted Jenkins server — same steps, no GitHub dependency. It runs `Install` (bun or npm), `Lint` (`tsc --noEmit`), `Build` (vite + esbuild → `dist/server.cjs`), `Test` (`scripts/test-documents.mjs` when present), and an optional `Docker` stage when the agent has Docker.

The Docker stage works like the GitHub Actions [`docker-build.yml`](.github/workflows/docker-build.yml) on a tag: it reads `version` from `package.json` and builds `ghcr.io/coff33ninja/dj-tech:<version>`. It pushes the image only if a `ghcr-registry-token` credential exists in Jenkins (Username/Password: username = GitHub username, password = a GitHub token with `write:packages`); without that credential the image is built locally on the agent and left unpushed. Unlike GitHub Actions, Jenkins tags only the version — no branch/sha tags.

Run the image the same way as the CI image — persistent state (`sqlite.db`, uploads, WhatsApp session) lives under `/data` via `DATA_DIR`:

```bash
docker run -d -p 3000:3000 -v djtech-data:/data ghcr.io/coff33ninja/dj-tech:<version>
```

### Setup

1. Create a pipeline job pointing at this repo's `Jenkinsfile` (Pipeline script from SCM).
2. The agent needs Node.js 20+ and bun (or npm), plus optionally Docker.
3. For GHCR pushes, add the `ghcr-registry-token` credential as above.

Jenkins builds from the source repo directly — it does not create GitHub releases. Use the GitHub Actions `Auto Tag` / `Release` workflows (or `push-and-release.ps1` / `push-and-release.sh`) for the release path.

## Configuration

There's no `.env` to fill in for normal use — mail (IMAP/POP3/SMTP), WhatsApp, business details, VAT, currency, and labour rate are all set from the **Settings** page and stored in the `settings` table, read at request time (see `getSetting` in `src/services/email.ts`).

`.env.example` only covers two AI-Studio-injected values, neither needed for local dev:
- `GEMINI_API_KEY` — unused in current code
- `APP_URL` — used for self-referential/OAuth links when deployed on AI Studio's Cloud Run
- `DATA_DIR` — optional; relocates `sqlite.db`, `data/`, and `wa_session/` (used by Docker)

WhatsApp login is QR-based through Baileys — start it from the Messages page; the session is cached in `wa_session/` so you don't re-scan on every restart.

## Documentation status

The docs in this repo are incomplete. `docs/Information.md` is the original build spec this app was generated from and `docs/slices.md` the order it was implemented in — but the app has grown past both. A full write-up that compares **what was planned** in those docs against **what is actually implemented** and **what was added along the way** (Docker, CI/CD, releases, Jenkins, WhatsApp, auto-filing, and everything in the [Features](#features) list) still needs to be written. The README, changelog, and API table above are the current best reference in the meantime.

## Roadmap

- **Real product-link crawler.** Replace the `/api/product-import` mock with an actual adapter architecture (Takealot and other SA suppliers first), each adapter normalizing to the same product shape and falling back to manual entry when a site can't be crawled.
- **Automatic tasks & reminders.** Tasks & Reminders stops being a manual-only page and starts generating itself from the rest of the system — warranty expiry, parts ETA slippage, jobs stalled in a status, post-collection follow-ups, low stock, and anything else the workflow implies.
- **Multi-user auth with granular permissions.** Real login for multiple users, with capabilities assigned per user/job-title rather than a fixed role hierarchy — a non-admin user can hold capabilities some admins don't. Deletion is gated behind a specific capability (admins have it by default, but it's the capability, not the "admin" label, that controls access).
- **AI provider ecosystem.** `@google/genai` was only the initial AI Studio scaffolding, not a locked-in choice — the plan is a pluggable AI layer so any provider/plugin can be wired in, not a single hardcoded SDK.

---

<sub><sup>
Built as an AI-assisted project: a repair shop runs on a laptop, a SQLite file, and a WhatsApp QR code. The pipeline makes sure the next version ships with the right tag, the right changelog, and the right image — so updating is one command, not an archaeology project.
</sup></sub>
