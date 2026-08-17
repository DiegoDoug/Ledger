# 1. Desktop delivery architecture

Status: Accepted
Date: 2026-08-17

## Context

Ledger is a local-first, single-user personal finance app: React 19 + TypeScript
+ Vite, no server, no account, data in IndexedDB behind a `LedgerRepository`
interface (`src/data/repository.ts`), with a localStorage and in-memory
fallback. It already has JSON backup/restore, CSV import/export, schema
migration, undo, and a PWA shell (manifest + service worker) for offline use
in the browser.

The ask is to add a genuine installable desktop delivery target — a native
window, a native icon, OS installers — for Windows, macOS and Linux, without
weakening the security model, without a server, and without disrupting the
web build or the existing persistence abstraction.

## Decision

**RECOMMENDATION: Tauri 2.x**

Ledger ships as a Tauri shell around the existing Vite/React build. The
domain layer, UI, state management and `LedgerRepository` interface are
untouched. IndexedDB remains the storage engine (see the persistence
decision below) — the desktop build does not introduce a new repository
implementation.

## Options considered

### Option A — Tauri 2.x (chosen)

Tauri wraps the OS's own web renderer (WebView2 on Windows, WKWebView on
macOS, WebKitGTK on Linux) with a Rust host process, rather than bundling a
browser. The frontend talks to Rust only through explicit, capability-gated
commands.

- **Size**: installers in the 3–15 MB range, since no browser engine ships
  inside the app.
- **Memory**: no second copy of a browser engine resident in RAM; typical
  idle usage is tens of MB above what the OS webview itself costs.
- **Security**: default-deny IPC. Every command a window may call is listed
  explicitly in a capability file; there is no Node.js runtime in the
  frontend to sandbox in the first place, so an entire class of Electron's
  `nodeIntegration`/`contextIsolation` foot-guns doesn't exist here.
- **Filesystem/SQLite**: first-party `dialog`, `fs`, and `sql` plugins;
  native file pickers are a few lines of Rust and a typed `invoke` call.
- **React/Vite fit**: Tauri is frontend-agnostic — `beforeDevCommand` /
  `beforeBuildCommand` in `tauri.conf.json` just run the existing `vite`
  and `vite build`. No changes to the web app's build graph.
- **Installers**: `tauri build` produces MSI/NSIS `.exe` on Windows, `.app`/
  `.dmg` on macOS, and `.AppImage`/`.deb` on Linux from one command.
- **Auto-update**: `tauri-plugin-updater`, signed update manifests.
- **Maturity**: Tauri 2.0 has been stable since October 2024; actively
  maintained, security-audited, growing plugin ecosystem.

### Option B — Electron

- **Size**: ships a full Chromium + Node runtime — typically 80–150 MB per
  app even before assets.
- **Memory**: a bundled Chromium process plus a Node-enabled main process
  routinely costs 150–300 MB of RAM at idle, several times Tauri's
  footprint, for a single-window utility app that does no rendering work
  heavier than SVG charts.
- **Security**: capable of being secured correctly (`contextIsolation: true`,
  `nodeIntegration: false`, a narrow preload bridge, `sandbox: true`), but
  that correctness is opt-in and must be actively maintained — the default
  posture is a full Node.js runtime sitting behind the renderer. For an app
  that handles financial data, "secure by careful configuration" is a
  weaker starting point than "secure by absence of the API surface."
- **Everything else** (filesystem access, SQLite via `better-sqlite3` or
  similar, installer generation via `electron-builder`, auto-update via
  `electron-updater`) is achievable and mature — Electron is not rejected
  for lacking capability, but for costing far more size and memory to get
  there, with a larger attack surface to hold closed.

### Option C — Other

- **Wails** (Go + webview): comparable size/memory profile to Tauri, but a
  smaller plugin ecosystem and less production track record for a
  security-sensitive app than Tauri's 2.x line. No compelling advantage
  over Tauri for this codebase, which has no existing Go investment either.
- **Neutralino**: minimal and lightweight, but its permission model is far
  coarser than Tauri's capability system and its ecosystem/security
  scrutiny is much smaller. Not an appropriate trade-off for a finance app.
- **PWA / installable web app**: Ledger already has this (manifest + service
  worker) and it remains the right answer for "use the app from a browser
  without installing anything extra." It does not satisfy this task's
  actual ask — a real OS installer, native menus/dialogs, and a store of
  data outside a browser profile — so it is kept as-is alongside the
  desktop build, not treated as a substitute for it.
- **Native rewrite** (per-platform Swift/WinUI/GTK): would satisfy "native
  feel" most completely, but directly violates the constraint against
  duplicating the domain and UI layers, and multiplies the maintenance
  surface by three. Rejected outright.

## Decision matrix

| Criterion | Weight | Tauri 2.x | Electron |
| --- | --- | --- | --- |
| Local-first compatibility | Very High | Native fit — no server, WebView has IndexedDB | Native fit — Chromium has IndexedDB |
| Security | Very High | Capability-gated IPC, no Node in renderer | Securable, but Node-capable by default |
| Cross-platform support | Very High | Windows/macOS/Linux, one config | Windows/macOS/Linux, one config |
| Maintainability | Very High | Small Rust surface, thin IPC | Larger main-process surface |
| Application size | High | ~3–15 MB | ~80–150 MB |
| Runtime memory | High | Tens of MB above the OS webview | 150–300+ MB |
| React/Vite compatibility | High | Drop-in, no frontend changes | Drop-in, no frontend changes |
| Native filesystem integration | High | `dialog`/`fs` plugins, typed commands | `fs`/native dialogs via Node |
| SQLite capability | High | `tauri-plugin-sql` available if ever needed | `better-sqlite3` available |
| Installer generation | High | `tauri build` → MSI/NSIS, dmg, AppImage/deb | `electron-builder` → same targets |
| Auto-update | Medium | `tauri-plugin-updater`, signed manifests | `electron-updater`, signed manifests |
| Development complexity | High | Requires a Rust toolchain | Requires only Node |
| Ecosystem stability | High | Stable since Tauri 2.0 (Oct 2024), active | Very mature, very large |

Electron's one real edge is development complexity — it needs no Rust
toolchain, only Node, which this environment already has. That is outweighed
by the size, memory, and default-security advantages Tauri gets from not
bundling a second browser engine, especially for an app whose job is
rendering a handful of forms and SVG charts, not a document editor or a
media-heavy UI that would actually benefit from Chromium's extra headroom.

## Persistence: keep IndexedDB, do not add SQLite

Tauri's window is a real OS WebView — WebView2, WKWebView, and WebKitGTK all
implement IndexedDB — so `src/data/repositories.ts` runs completely unchanged
inside the desktop shell. `LedgerRepository`, `IndexedDbRepository`,
`LocalStorageRepository`, `MemoryRepository`, and the fallback/migration
logic in `openRepository()` all continue to work exactly as they do in a
browser. This is Strategy 1 from the task brief, chosen over introducing a
`DesktopSqliteRepository`:

- **Durability / corruption resistance**: IndexedDB in a maintained,
  evergreen OS webview is not meaningfully less durable than SQLite for a
  single-writer, single-process, modest-sized document (a personal ledger is
  thousands of rows, not millions). The existing `corrupt` handling in
  `data/store.tsx` already treats an unreadable document as a first-class,
  recoverable state.
- **Portability / backups**: the app already exports a complete,
  human-readable JSON snapshot (`buildBackup`/`parseBackup` in
  `src/domain/portability.ts`) and a spreadsheet-friendly CSV. That is the
  actual backup story users rely on — a `.sqlite` file wouldn't replace it,
  since both formats already work identically on every platform. SQLite
  would add a second, redundant source of truth to keep in sync with the
  JSON export.
- **Migration**: `migrateDocument()` already versions the one JSON document
  on read. A SQLite adapter would need its own schema-migration story
  (`PRAGMA user_version`, `ALTER TABLE`, …) running in parallel with the
  existing document migration — duplicated logic for no behavioural gain.
- **Concurrency**: Ledger is single-window, single-process. SQLite's main
  advantage — safe concurrent multi-writer access — is not a problem this
  app has.
- **User-visible data location**: a fair point in SQLite's favour (a single
  file a user can find and copy), but it's already answered by "Open data
  directory" plus the JSON backup being the thing users are told to rely on
  (see README's "Where your data lives") — a raw SQLite file on disk is not
  more discoverable or more meaningful to a non-technical user than an
  explicit "Export backup" button.
- **Future sync / future AI functionality**: neither is in scope (and is
  explicitly excluded — no telemetry, no cloud sync). If a server or sync
  layer is ever added, the task the codebase is already built for is
  "write one more `LedgerRepository`," and that argument applies equally
  whether the desktop store today is IndexedDB or SQLite. It is not a
  reason to add SQLite now.

Net: introducing SQLite would add a Rust dependency, a new repository
implementation, and a second migration system, in exchange for benefits
(multi-writer safety, single portable file) that don't address a real
problem Ledger has. `LedgerRepository` stays exactly as it is — the
desktop delivery target changes nothing below the UI/state layer.

## Service worker on desktop

The service worker (`public/sw.js`, registered by
`src/lib/registerServiceWorker.ts`) exists to make the *browser* app
installable and to let a network-first shell keep working offline. Inside a
Tauri window there is no network dependency to protect against and no
browser "install" affordance to earn — the app is already a native window
that works with zero network access. Registering the worker there would add
a second cache layer with its own invalidation story for no benefit, so
registration is disabled in desktop builds (`isDesktop()` short-circuits
`registerServiceWorker()`). The web/PWA build is unaffected.

## Consequences

- `src-tauri/` is added as a self-contained Rust project; nothing in `src/`
  outside a small `src/lib/desktop.ts` bridge module is desktop-aware.
- The native command surface is deliberately minimal: save/read a text file
  at a path the user picked through a native dialog, reveal the app's data
  directory, and report the app version. No generic file read/write is
  exposed to the frontend.
- Packaging (`npm run desktop:package`) requires a Rust toolchain on the
  build machine; this repository's current environment does not have one
  installed, so Rust compilation and installer generation cannot be
  exercised here. Everything that does not require compiling Rust — the
  bridge code, the Rust source, the Tauri configuration, the CI workflow —
  is implemented and documented; see the verification report for exactly
  what was and wasn't run.
