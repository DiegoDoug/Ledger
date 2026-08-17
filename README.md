# Ledger

A personal finance application for tracking income, expenses and transfers,
budgeting, managing recurring bills, and understanding where the money actually
goes.

Ledger is **local-first and self-hostable**. It runs entirely in the browser,
stores your data in IndexedDB on your own device, and ships as a single static
container you can put behind any reverse proxy. There is no account to create, no
server to call, and nothing leaves the machine.

```bash
docker compose up -d --build   # then open http://localhost:8080
```

## Contents

- [What it does](#what-it-does)
- [Technology](#technology)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [Docker](#docker)
- [Desktop](#desktop)
- [Self-hosting](#self-hosting)
- [Where your data lives](#where-your-data-lives)
- [Import and export](#import-and-export)
- [Design](#design)
- [Keyboard](#keyboard)
- [Limitations](#limitations)

## What it does

| Section | What it is for |
| --- | --- |
| **Dashboard** | Net worth, assets, liabilities and spendable balance, plus income, expenses, net cash flow and savings rate for a period you choose. Recent activity, upcoming bills, budget health and a six-month cash-flow chart. |
| **Transactions** | Every recorded movement of money. Create, edit, delete, search, filter by type, category, account, date range and amount range, and sort by date, amount, description or category. |
| **Accounts** | Checking, savings, credit card, cash, investment and other. Balances are always derived, never stored. Credit cards are treated as liabilities. |
| **Budgets** | Monthly caps, either overall or per category, with on-track / approaching / over-budget states for any month. |
| **Recurring** | Weekly, monthly and yearly schedules for bills, income and transfers. Occurrences post themselves when their date arrives. |
| **Analytics** | Spending by category, income vs expenses, monthly cash flow, spending trend, top categories, savings rate, budget performance and category movement — over six preset periods or a custom date range. |
| **Search** | Full-page search across descriptions, categories, accounts and notes, combinable with every filter, with a running total and category breakdown of whatever matched. |
| **Categories** | Create, rename and recolour categories. Deleting one that is in use requires choosing where its transactions go. |
| **Settings** | Currency, number format, theme, CSV and JSON export, CSV import, backup restore, demo reset and a clear honest account of where the data is kept. |

### Transfers are a first-class operation

Moving €500 from checking to savings is not income and not an expense. In Ledger
a transfer is its own transaction type carrying **two** accounts, so it:

- decreases the source account and increases the destination,
- leaves net worth unchanged,
- never appears in income, expenses, net cash flow or the savings rate,
- never consumes a budget,
- never appears in a category breakdown (it has no category),
- but is still searchable, filterable and reported separately so you can see it.

This is modelled as one row rather than a pair of matched income/expense rows,
which makes double-counting structurally impossible.

## Technology

| | |
| --- | --- |
| Framework | React 19 + TypeScript (strict), Vite 7 |
| Styling | Tailwind CSS 4 with CSS custom properties for theming |
| Routing | React Router 7, hash-based |
| Charts | Hand-drawn SVG — no charting dependency |
| Storage | IndexedDB, with a localStorage fallback |
| Tests | Vitest — 303 tests over the financial logic and platform helpers |
| Runtime image | nginx on Alpine, non-root, read-only filesystem |
| Desktop shell | Tauri 2 (Rust host + the OS's own WebView) — optional, same web build |

Three runtime dependencies: `react`, `react-dom` and `react-router-dom`, plus a
self-hosted variable font. No UI kit, no chart library, no date library, no state
management library, no icon package.

## Architecture

The rule the codebase is built around: **no component does arithmetic on money.**
Every figure the UI renders comes from a pure function in `src/domain`, which
makes the financial logic testable without a DOM and impossible to duplicate
across screens.

```
UI (components, pages)
  ↓  reads results, never computes them
Application (data/store.tsx — reducer, actions, undo)
  ↓
Domain (src/domain — pure, no React, no browser APIs)
  ↓
Repository (data/repository.ts — one interface)
  ↓
IndexedDB  ·  localStorage  ·  memory
```

```
src/
  domain/           pure logic, no React
    types.ts          Transaction, Account, Category, Budget, RecurringTransaction
    money.ts          cents ⇄ display, input parsing
    dates.ts          date-only ISO arithmetic
    calculations.ts   balances, net worth, cash flow, savings rate, budgets
    filters.ts        search, filter, sort
    analytics.ts      reporting periods, aggregation, category movement
    recurring.ts      schedules, next occurrence, posting
    validation.ts     one validator shared by the form and the importer
    csv.ts            RFC 4180 parse/format
    portability.ts    CSV/JSON export, two-phase validated import
    seed.ts           demo data generator
  data/
    repository.ts     the persistence interface (LoadResult, SaveResult)
    repositories.ts   IndexedDB, localStorage and memory implementations
    migrate.ts        schema migration for stored documents
    store.tsx         reducer + context, CRUD actions, undo stack
  components/
    ui/               Button, Card, Field, Modal, Menu, Toast, primitives
    charts/           hand-drawn SVG charts
    …                 app shell, transaction dialog, import dialog, search, rows
  pages/              Dashboard, Transactions, Accounts, Budgets, Recurring,
                      Analytics, Search, Categories, Settings
  lib/                formatting, download, service worker registration
```

### Money

Amounts are **integer minor units** (cents) everywhere. Floating point never
touches a stored value, so sums are exact and every total is reproducible.
`€123.45` is stored as `12345`; only the formatting layer turns it back into a
string. Amounts are stored as a positive magnitude with direction carried by
`type`, keeping sign handling in exactly one place.

### Dates

Dates are **date-only ISO strings** (`YYYY-MM-DD`) with no timezone, because a
ledger entry is a calendar day, not an instant. They are only turned into `Date`
objects through `parseIso`, which builds a *local noon* date so no DST shift can
ever roll an entry back a day. A transaction entered for 11 August 2026 is that
date in every timezone.

### Key formulas

| Figure | Definition | Edge case |
| --- | --- | --- |
| Net cash flow | `income − expenses` | transfers excluded by construction |
| Savings rate | `(net income ÷ income) × 100` | `0` when income is `0` |
| Account balance | `opening + income − expenses ± transfers` | orphaned rows ignored |
| Assets | sum of every positive active balance | — |
| Liabilities | sum of every negative active balance, as a magnitude | includes overdrawn asset accounts |
| Net worth | `assets − liabilities` | always equals the signed sum of balances |
| Total balance | balances of non-liability accounts | excludes credit cards |
| Budget utilization | `spent ÷ budget × 100` | `0` when the budget is `0` |

### Persistence

The whole ledger is one JSON document behind a `LedgerRepository` interface.
IndexedDB is the primary implementation; if it cannot be opened, Ledger falls
back to localStorage, and failing that runs in memory for the session with a
visible warning rather than pretending the data is safe. A document written by an
older version is migrated on read.

Because the domain layer never touches storage, adding a server API and Postgres
later means writing one more `LedgerRepository` — the financial logic does not
change.

### Recurring transactions

A recurring transaction is a *rule*, not a row. On load, `materialiseRecurring`
posts every occurrence the schedule owes since the last visit and records the
last posted date, so the operation is idempotent — reloading never
double-posts. History stays fully editable; deleting a rule stops the future
without rewriting the past.

### Undo

Every mutation pushes the previous document onto an undo stack (25 deep), so
deletions, edits, imports, restores and resets can all be reversed from the toast
that reports them.

## Getting started

Requires Node 20.12 or newer. To run it without Node at all, see [Docker](#docker).

```bash
npm install
npm run dev
```

Open <http://localhost:5183>. On first launch Ledger seeds eight months of
realistic demo data — salary, rent, groceries, restaurants, subscriptions,
utilities, a gym, travel, an ATM withdrawal, a savings sweep, a brokerage
contribution and a credit-card payment that settles each month's statement — so
every screen has something meaningful to show. Settings can restore or clear it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5183, listening on all interfaces |
| `npm run build` | Type-check then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run verify` | typecheck → test → build |
| `npm run docker:build` | Build the production image |
| `npm run docker:up` | Build and start the container |
| `npm run docker:down` | Stop and remove the container |
| `npm run desktop:dev` | Launch the desktop shell against the Vite dev server |
| `npm run desktop:build` | Debug desktop build — compiles without full optimisation |
| `npm run desktop:package` | Release desktop build — produces the OS installers |

## Testing

303 tests — deliberately no snapshot tests. Almost all of them are over the
financial logic, plus a handful for the desktop-detection helpers in
`src/lib/desktop.ts`. They cover:

- money parsing and formatting, including thousands separators and both decimal conventions
- date-only arithmetic, month clamping, leap years and range aggregation
- account balances, including both sides of a transfer and orphaned rows
- assets, liabilities, net worth and spendable balance, including overdrawn accounts and overpaid cards
- net cash flow and savings rate, including the zero-income case
- **transfers**: excluded from cash flow, savings rate, budgets and category totals; balance-neutral overall
- budget utilization, status thresholds and rolled-up budget health
- transaction filtering, searching and sorting, including transfer-specific behaviour
- monthly and date-range aggregation, reporting periods and custom ranges
- recurring schedules, next occurrence, idempotent posting and transfer schedules
- transaction validation — every required field, invalid amounts and dates, and transfer rules
- CSV parsing and writing, including quotes, embedded newlines, BOMs and semicolon delimiters
- CSV import validation, duplicate detection, defaults and the export/import round trip
- demo-data invariants — no negative cash, a bounded card balance, no dangling references
- the desktop/browser detection guard, and path-to-filename parsing for the native save/restore dialogs

```bash
npm run test
```

## Docker

The image is a two-stage build: Node installs dependencies, type-checks and
builds; nginx on Alpine serves the result. The runtime stage contains no Node,
no `node_modules` and no development dependencies.

```bash
docker compose up -d --build
```

Open <http://localhost:8080>.

```bash
docker compose logs -f     # follow logs
docker compose ps          # check health
docker compose down        # stop
```

To change the port, copy `.env.example` to `.env` and edit `LEDGER_PORT`.

The container runs as the unprivileged `nginx` user on a read-only filesystem
with all capabilities dropped, and exposes `/healthz` for the healthcheck and any
load balancer in front of it.

## Desktop

Ledger also ships as a native desktop app — a real installer, a native window
and icon, no browser tab — built with [Tauri 2](https://tauri.app). It is the
same React/Vite application, unmodified: the desktop shell adds a Rust host
process around the existing web build rather than forking the frontend. See
[`docs/adr/0001-desktop-delivery-architecture.md`](docs/adr/0001-desktop-delivery-architecture.md)
for the full reasoning, including why it's Tauri rather than Electron and why
storage stays on IndexedDB rather than moving to SQLite.

**Requirements**, beyond what the web app needs:

- A Rust toolchain ([rustup.rs](https://rustup.rs)) — stable channel.
- Windows: the [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
  runtime (preinstalled on Windows 11 and current Windows 10) and the MSVC
  Build Tools.
- macOS: Xcode Command Line Tools (`xcode-select --install`).
- Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`,
  `patchelf`, `build-essential`, `libssl-dev`, `libgtk-3-dev` (Debian/Ubuntu
  package names; see `.github/workflows/desktop.yml` for the exact install
  step).

```bash
npm run desktop:dev       # native window + Vite dev server, with hot reload
npm run desktop:build     # debug build — compiles, skips full optimisation
npm run desktop:package   # release build — produces the installers below
```

`desktop:package` writes installers to `src-tauri/target/release/bundle/`:

| Platform | Artifacts |
| --- | --- |
| Windows | `msi/*.msi`, `nsis/*-setup.exe` |
| macOS | `macos/*.app`, `dmg/*.dmg` |
| Linux | `appimage/*.AppImage`, `deb/*.deb` |

### What changes on desktop, and what doesn't

- **Storage is unchanged.** WebView2, WKWebView and WebKitGTK all implement
  IndexedDB, so `LedgerRepository` and its IndexedDB/localStorage/memory
  implementations run exactly as they do in a browser — nothing in
  `src/data/` is desktop-aware. The ledger document itself never touches
  Rust.
- **Backup, restore and CSV export/import use native dialogs** instead of a
  browser download/file input, via a narrow bridge in
  [`src/lib/desktop.ts`](src/lib/desktop.ts). Every other page is identical
  to the web build.
- **The service worker does not register** inside the desktop shell — there
  is no browser "install" affordance to earn and no network dependency to
  protect against, since the window is already a native, fully offline app.
- **Settings gains a "Data directory" control** pointing at the app's own
  data folder (the OS's per-app application-data directory), so the app has
  an honest answer to "where does this live" beyond "inside the WebView,"
  even though the ledger document itself is still stored by the WebView, not
  as a file in that directory.

### Security model

Ledger handles financial data, so the desktop shell is deliberately
narrow — see `src-tauri/capabilities/default.json` and `src-tauri/src/lib.rs`:

- **No Node.js in the renderer.** Unlike Electron, there is no Node runtime
  in the frontend to sandbox in the first place — `contextIsolation` /
  `nodeIntegration` don't apply because the class of risk they exist to
  contain isn't present.
- **Capability-gated IPC.** The main window's capability file grants only
  `core:default` plus the two dialog operations the app actually uses
  (`dialog:allow-open`, `dialog:allow-save`). No filesystem, shell, or HTTP
  plugin permission is granted to the frontend at all.
- **No generic file access.** The app defines exactly two file commands,
  `save_text_file` and `read_text_file`, and both only ever act on a path
  the user just chose through a native OS dialog — there is no
  `readArbitraryFile`/`writeArbitraryFile`-shaped command, and the frontend
  cannot list, walk or glob the filesystem.
- **A strict CSP** (`src-tauri/tauri.conf.json`) blocks every remote origin,
  mirroring the CSP the Docker image already serves.
- **No remote content.** The window only ever loads the app's own built
  assets; there are no external links in the app to restrict navigation for.
- **Import validation is unchanged.** JSON backups and CSV files are parsed
  and validated by the same `parseBackup`/`analyseCsvImport` code paths as
  the web build — the desktop shell only ferries bytes from disk to the
  frontend, it does not parse or trust them itself.

### Signing, notarization and auto-update

Not configured in this repository — that requires credentials only the
maintainer holds. `.github/workflows/desktop.yml` documents exactly which
secrets to add and where they plug in:

- **Windows**: an Authenticode certificate (`WINDOWS_CERTIFICATE` +
  `WINDOWS_CERTIFICATE_PASSWORD`), or installers will show an "unknown
  publisher" warning.
- **macOS**: a Developer ID certificate and notarization credentials
  (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`), or macOS Gatekeeper will
  block the unsigned `.app`/`.dmg`.
- **Auto-update**: `tauri-plugin-updater` plus a signing keypair
  (`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Not
  wired up yet — see the ADR's "Remaining work" for what that involves.

Until those are added, `desktop:package` still produces working, installable
binaries — they're just unsigned, which is fine for local use or manual
distribution and expected to trigger an OS warning on first run.

## Self-hosting

Ledger is a static bundle with **no hardcoded host, port or origin**. It is built
with a relative base and uses hash-based routing, so it works unchanged at a
domain root, in a subdirectory, or behind a path-rewriting proxy — and needs no
SPA rewrite rules.

Bind it to localhost only and let a proxy terminate TLS:

```bash
# .env
LEDGER_BIND=127.0.0.1
LEDGER_PORT=8080
```

**Caddy** — TLS is automatic:

```caddy
ledger.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name ledger.example.com;

    # ssl_certificate / ssl_certificate_key …

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik** — add to the `ledger` service in `docker-compose.yml`:

```yaml
labels:
  - 'traefik.enable=true'
  - 'traefik.http.routers.ledger.rule=Host(`ledger.example.com`)'
  - 'traefik.http.routers.ledger.entrypoints=websecure'
  - 'traefik.http.routers.ledger.tls.certresolver=letsencrypt'
  - 'traefik.http.services.ledger.loadbalancer.server.port=8080'
```

Serve it over **HTTPS** if you can. Ledger works fine over plain HTTP on a LAN,
but browsers only enable service workers in a secure context, so offline support
and installing it as an app require HTTPS (or `localhost`).

## Where your data lives

**On your device. Nowhere else.**

- Your ledger is a single JSON document in **IndexedDB** under the database
  `ledger` — in the browser profile you are using for the web build, or in the
  desktop app's own WebView storage for the Tauri build. Either way it is the
  same storage engine and the same `LedgerRepository` code. The theme
  preference is kept in `localStorage` so it can be applied before the first
  paint.
- The Docker container serves static files and **stores nothing**. Deleting and
  recreating it does not touch your data. There is no volume to back up, because
  there is no server-side state.
- Nothing is uploaded, synchronised or shared. There is no analytics, no
  telemetry and no outbound request of any kind — the production Content Security
  Policy blocks connections to any other origin.

What that honestly means:

- Your data is **not encrypted**. IndexedDB is plain storage; anyone who can use
  this browser profile on this device can read it. Ledger has no authentication
  and is not multi-user — treat access to the device as access to the data.
- Data does **not** follow you between devices, browsers or profiles. A different
  browser is a different, empty ledger.
- Clearing site data, using private browsing, or a browser evicting storage under
  disk pressure will delete it.

So: **export a JSON backup periodically.** That file is the only copy that
outlives the browser.

## Import and export

**Export** — from Settings:

- **CSV** — every transaction as `Date, Description, Amount, Type, Category, Account, To Account, Notes`. Amounts are positive decimals; direction lives in the Type column. Opens in any spreadsheet and imports straight back into Ledger without loss.
- **JSON** — a complete backup: accounts, categories, transactions, budgets, recurring schedules and settings. This is what you restore from.

**Import** — CSV, in two phases. Ledger analyses the file and shows a preview
before anything is written:

- `Date`, `Description` and `Amount` are required; `Type`, `Category`, `Account`,
  `To Account` and `Notes` are optional.
- Common alternative headers are recognised (`Payee`, `Value`, `Posted Date`,
  `Memo`, `From`/`To`), as are semicolon and tab delimiters, UTF-8 BOMs, quoted
  fields with embedded commas and newlines, `DD/MM/YYYY` and `MM/DD/YYYY` dates,
  and both `1,234.56` and `1.234,56`.
- Direction comes from the `Type` column when present, otherwise from the sign of
  the amount; a destination account implies a transfer.
- Every row is classified **ready**, **duplicate** or **invalid**, with the line
  number and the reason. Nothing is discarded silently.
- Duplicates are detected against your existing ledger *and* within the file
  itself, and are skipped unless you opt in.
- Accounts and categories named in the file but missing from your ledger can be
  created in the same step, or the rows referencing them are reported as invalid.
- An import can be undone immediately afterwards.

**Restore** replaces everything currently stored, so export first.

## Design

Neutral palette, one accent, subtle borders, tabular numerals on every figure.
Light and dark themes are driven by CSS custom properties on `:root`/`.dark`,
applied before first paint to avoid a flash.

Status is never communicated by colour alone — budgets carry a text label
("On track" / "Approaching limit" / "Over budget") and over-budget meters are
hatched; deltas carry a direction arrow; deficit bars are hatched as well as
coloured; transfers carry an arrow glyph and an explicit label.

Charts are hand-drawn SVG measured in real pixels via `ResizeObserver`, so type
never stretches. Each one renders a visually hidden table of the same figures for
screen readers.

Layouts are tested from 320px to 1440px and beyond, with no horizontal overflow:
a persistent sidebar on desktop, a bottom bar with an overflow sheet on mobile,
and wide tables that scroll inside their own container rather than the page.

## Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Quick transaction search |
| `N` | New transaction |
| `Esc` | Close dialog or search |
| `↑` `↓` `Enter` | Move through and open search results |

Dialogs trap focus, restore it to the trigger on close, and are labelled for
assistive technology. Every control is reachable by keyboard with a visible focus
ring.

## Limitations

Stated plainly, because a finance tool that overstates itself is worse than one
that does less.

- **Single device, single user.** No sync, no accounts, no sharing, no server. The
  data is in one browser profile and is not encrypted. Use the JSON export as your
  backup.
- **One currency at a time.** Ledger formats every amount in your chosen primary
  currency. It does **not** convert between currencies — there are no exchange
  rates. Changing the currency reformats existing amounts rather than converting
  them, and accounts record a currency only so a future version has somewhere to
  put it.
- **Investment accounts track contributions, not markets.** Balances reflect money
  you moved in and out. There is no price data, so no gains, losses or holdings.
- **Recurring schedules** support weekly, monthly and yearly only — not
  fortnightly, twice-monthly or custom intervals — and have no end date.
- **Budgets are monthly** and apply from their start month onward. There is no
  per-month override and no history of what a budget used to be.
- **Import is CSV only.** No OFX, QIF or bank APIs. Restoring the full document
  requires Ledger's own JSON backup.
- **No attachments** — no receipt images or file uploads.
- **Duplicate detection is deliberately strict**: same day, direction, amount,
  account and description. Two genuine identical coffees on one day will be
  flagged for review rather than silently dropped.
- **Offline support needs a secure context.** The service worker only registers
  over HTTPS or on `localhost`, so a plain-HTTP LAN deployment will not work
  offline or install as an app. The app itself is fully functional offline once
  loaded either way.
- **No transaction splitting** — one transaction has one category.
