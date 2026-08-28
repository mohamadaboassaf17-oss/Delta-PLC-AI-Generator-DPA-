# AGENTS.md — Delta PLC AI Generator (DPA)
<!-- v2.1 — Aug 2026: adds UI Consistency Rules, Recent Projects persistence,
     and Settings/API-key management rules derived from the visual & functional audit. -->

## Provider Architecture (M11+)
All AI providers implement the `AiProvider` trait in `src-tauri/src/providers/`.
OpenAI and Custom share request/response logic via `openai_compat.rs` (both use `/chat/completions` format).
Anthropic and Gemini have dedicated modules due to differing request/response schemas.
Custom Provider domains are NOT in the static CSP/allowlist. They are validated at runtime via `domain_trust.rs` (Trust on First Use). HTTPS required except `localhost`/`127.0.0.1`.
System prompts (DVP cheatsheet) are assembled in `src/lib/prompts/` (`cheatsheet.ts` + `stPrompt.ts`/`chatPrompt.ts`/`reviewPrompt.ts`) and sent as a single `role: "user"` message with the cheatsheet prefixed; `src-tauri/src/providers/gemini.rs:split_system_and_contents` handles `systemInstruction` for any future `role: "system"` message. Sanitization is mirrored in `src/lib/prompts/sanitize.ts` and `src-tauri/src/prompts.rs`. No `prompts/inject.rs` file exists — see M11.6 decision (intentionally unchanged).

## Trust on First Use (M11.4)
Custom Provider endpoints are gated by a `TrustedDomainList` persisted at `<app_data_dir>/trusted_domains.json`. On the first request to a new domain, the frontend must show `TrustDomainModal` and call `trusted_domains_add` before the Rust backend will issue the HTTP request. SSRF protection: `domain_trust::classify_ssrf` blocks 169.254.x.x (cloud metadata) unconditionally and warns on private-IP ranges.

## Project Schema Version
v2: original schema (id, name, timestamps, version=2, meta, optional io_table/generated/hmi_table/chat_history)
v3: same as v2 but `version: 3`. Migration is automatic on read via `migrate_v2_to_v3`.

## Project Overview
Tauri v2 desktop app (Windows 10/11, 64-bit) for generating Delta DVP Series PLC code (ST, LD, IL) and HMI tag tables via LLM APIs (BYOK). React + Tailwind frontend, Rust backend core. See `DPA_PRD.md` for full product spec.

## Build / Lint / Test
# Frontend (React + TypeScript + Tailwind) — toolchain lives at REPO ROOT (not src/)
 npm install
 npm run dev          # Vite dev server on localhost:1420 (strictPort, WebView2)
 npm run build        # Production build → dist/
 npm run lint         # ESLint (flat config)
 npm run typecheck    # tsc --noEmit (strict)
 npm run test         # Vitest (watch mode, jsdom)
 npm run test -- --run              # Single run, no watch
 npm run test -- --run path/to/file # Single test file
 # Tauri (Rust backend)
 cd src-tauri
 cargo build          # Development build
 cargo clippy -- -D warnings        # Lint all Rust code
 cargo test           # All Rust tests (334 tests, 3 ignored)
 cargo test test_name               # Single test by name filter
 # Full Tauri desktop app (run from REPO ROOT)
 npm run tauri dev    # Launch with hot-reload
 npm run tauri build  # Production MSI/NSIS installer (≤20 MB target; verified 4.8 MB MSI / 3.4 MB NSIS)

## Code Style
### TypeScript / React
Imports: React first, then third-party libs, then `@/` path aliases, then relative. Server/backend before client if both present.
Formatting: Prettier with default config. 2-space indent. Single quotes. No semicolons. Trailing commas in multi-line (ES5).
Types: Strict mode (`strict: true` in tsconfig). Prefer `interface` over `type` for object shapes; `type` for unions, intersections, and primitives. Avoid `any` — use `unknown` and narrow.
Naming: PascalCase for components and interfaces (`IOMappingTable`). camelCase for variables, functions, and instances (`ioTable`, `getIoMapping`). Prefix boolean flags with `is`/`has`/`should` (`isGenerating`, `hasApiKey`). Event handlers: `handle*` (`handleGenerate`). Props types: `{ComponentName}Props`.
Components: React functional components only with explicit return types (`React.FC` is acceptable but explicit return is preferred). Keep components under 200 lines; extract sub-components and hooks. Use named exports for utilities/hooks; default exports only for page-level components routed by Tauri.
Hooks: Extract shared logic into custom hooks in `src/hooks/`. Prefix with `use`. Single responsibility per hook.
Error handling: Use React Error Boundaries for component trees. Async operations return `Result<T, AppError>` or `{ data, error }` shapes — never throw in event handlers. Display errors with a `<StatusBar>` or toast, never `alert()`.
State: React Context + `useReducer` for global app state (project data, I/O table, API key presence). Local state for UI-only concerns (panel open/close, active tab). Avoid prop drilling beyond 2 levels.
Prompts / LLM calls: All LLM prompt construction lives in `src/lib/prompts/`. Never inline raw prompts in components. Attach the I/O table as immutable context to every modification request (see PRD §7.2).
Debug UI: Any performance monitors, debug panels, or dev-only overlays must be conditionally rendered: `{import.meta.env.DEV && <DebugPanel />}`. Never render debug UI in production builds.

### Rust (Tauri Backend)
Imports: `std` first, then external crates, then `crate::` modules. Group related imports.
Formatting: `rustfmt` with default settings. 4-space indent.
Types: `#[derive]` all applicable traits (Debug, Clone, Serialize, Deserialize). Use `Result<T, Box<dyn Error>>` for library code; use a custom error enum with `thiserror` for application code.
Naming: snake_case for functions, variables, modules. PascalCase for types, enums, structs. SCREAMING_SNAKE_CASE for consts/statics.
Error handling: Use `anyhow` for application-level errors, `thiserror` for library-level. Prefer `.context()` to attach messages. Never `unwrap()` in production code — use `?` with `Result` or `.expect()` with a descriptive message only when the invariant is truly unrecoverable.
Commands: Tauri commands (`#[tauri::command]`) go in `src-tauri/src/commands/` — one module per feature area (io_table, generation, project, settings, recent_projects). Validate all input with explicit types; never trust frontend payloads.
Security: Store API key via OS keychain (`tauri-plugin-keychain` or `keyring` crate). Never log API keys. Sanitize file paths with `tauri::api::path::resolve`. Validate `.dpa` file extension before deserialization.

### CSS / Tailwind
Use Tailwind utility classes exclusively; no custom CSS files unless absolutely necessary. Custom CSS only in `src/styles/` with a comment explaining why Tailwind couldn't handle it. (v2.1: `src/styles/scrollbars.css` is the sanctioned exception for themed scrollbars. M6: `src/styles/ladder.css` is the second sanctioned exception for React Flow dark theming — Controls/Minimap/Background.)
Follow mobile-first responsive ordering: unprefixed → `sm:` → `md:` → `lg:`.
Component variants extracted with `@apply` inside `@layer components` only if reused ≥3 times.

## UI Consistency Rules (v2.1)
Scrollbars (FIX-04): All scrollable regions MUST use the themed dark scrollbars defined in `src/styles/scrollbars.css`. Native light scrollbars are prohibited; review any new scrollable container against this rule.
Dropdowns (FIX-07): Native `<select>` elements are prohibited in app UI. Use the custom dark `Dropdown.tsx` component for Model, Theme, and provider/model pickers.
Placeholders (FIX-06): Hint text MUST use the `placeholder` attribute. Never pre-fill a textarea/input with hint text as its `value`. Add a review check: hint text must not be selectable.
Tables (FIX-05): `IOMappingTable` and `HMITagTable` MUST render without horizontal overflow at the default sidebar width (≥280px). Use a fixed table layout with defined column widths; collapse columns by priority (Address → Type → Label → Default → Comment) when narrow. Header overlap is a blocking defect. Truncated cells MUST expose a `title` tooltip.
Disabled controls (FIX-09): Every disabled button MUST carry a `title` (and `aria-disabled`) explaining the enabling condition (e.g., "Enter a description first", "Generate code to enable export").
Brand names (FIX-08): Use official brand strings from a single constant map (`src/lib/brands.ts`): `OpenAI`, `Anthropic`, `Google Gemini`. Never hardcode variants such as "Openai".

## Recent Projects Persistence (v2.1 — FIX-02)
Rust module `src-tauri/src/commands/recent_projects.rs` (canonical) exposes: `recent_projects_list`, `recent_projects_push`, `recent_projects_remove`; legacy alias `project_list_recent` in `commands/project.rs` kept for back-compat.
Persisted at `<app_data_dir>/recent_projects.json` as `RecentList { entries: Vec<RecentEntry { id, name, path, last_opened }>, max_entries }` (pretty JSON; `max_entries` defaults to 10, effective cap `10` when `0`). Legacy `<app_data_dir>/recent.json` is read as fallback and migrated on next write. `upsert_recent` is invoked on: successful **save**, save-as, and open (FIX-02: `project_save` now also bumps MRU; previously only save-as/open did). Deduplicate by `path` (primary) + `id` (secondary for Save-As); cap at 10 entries (most recent first).
Frontend hook `src/hooks/useRecentProjects.ts` refreshes on mount and listens to global `dpa:recents:refresh` event; `src/context/ProjectContext.tsx:158` emits that event after `openExisting`/`save`/`saveAs`/`close`. `remove` now calls `recent_projects_remove` IPC and re-fetches; `RecentProjectsList` shows backend-persisted state.

## Settings & API Keys (v2.1 — FIX-01/FIX-03)
Components: `ApiKeySettings.tsx` (masked per-provider key input + Test Connection), `ByokWizard.tsx` (step-by-step guide with direct links), `Dropdown.tsx`.
Commands in `src-tauri/src/commands/settings.rs`: `settings_set_api_key(provider, key)` (stores via OS keychain; never returns the key to the frontend; never logs it), `settings_has_api_key(provider) -> bool`, `settings_test_connection(provider) -> Result<()>`.
The Settings panel MUST always render the key field for the currently selected provider; error messages that reference Settings MUST deep-link to it (no dead-ends).
On AppShell mount, if `settings_has_api_key` is false for **all four** providers (`openai`, `anthropic`, `gemini`, `custom`) via `Promise.all`, and `localStorage["dpa.onboarded"] !== "1"`, open `ByokWizard` automatically before any other action (FIX-03). Canonical check is `settings_has_api_key` (not raw `secret_get`), gated on the onboarding flag.

## File Naming & Structure
src/
  components/       # PascalCase.tsx (IOMappingTable.tsx, ApiKeySettings.tsx, ByokWizard.tsx, Dropdown.tsx)
  hooks/            # useCamelCase.ts  (useProject.ts, useRecentProjects.ts)
  lib/              # camelCase.ts     (prompts.ts, api.ts, brands.ts)
  styles/           # kebab-case.css   (ladder.css, scrollbars.css)
  types/            # camelCase.ts     (project.ts, io.ts)
src-tauri/
  src/
    commands/       # snake_case.rs    (io_table.rs, recent_projects.rs, settings.rs)
    models/         # snake_case.rs    (project.rs)
Always use the filename that matches the primary export.

## Key Patterns
Context Anchoring (PRD §7.2): When the user modifies generated code, include the full I/O table as a preamble in every LLM request. This prevents the model from reassigning reserved addresses.
Conflict Detection: Before rendering generated code, run a post-processing pass to cross-reference addresses against the I/O table. Flag mismatches with red highlighting and halt rendering if conflicts exceed threshold.
Export Pipeline: ST → LD conversion via custom algorithm (not LLM). The LLM produces ST; a deterministic Rust function maps ST to SVG/React Flow nodes for the ladder diagram view.
Project files: `.dpa` files are JSON archives with a versioned schema (`version: 3`). Always validate schema version on load and provide migration paths.
DVP Address Validation: All I/O addresses must pass `validate_dvp_address()` (Rust) before any use. Delta DVP uses octal numbering — X8/X9/Y8/Y9 are invalid. Frontend also validates inline; Rust validation is the authoritative layer.

## v2.1 Audit Checklist (Definition of Done)
Before merging any UI change, verify:
[ ] Scrollbars are dark-themed everywhere (no white strips).
[ ] No table header overlap; no horizontal scroll at default sidebar width; truncated text has tooltips.
[ ] Recent Projects list updates immediately after save/save-as/open/close.
[ ] Settings contains per-provider masked API key fields with Test Connection; BYOK wizard reachable in one click.
[ ] Missing-key errors deep-link to Settings/wizard; wizard auto-opens on first launch without keys.
[ ] Chat and description hint texts are real `placeholder` attributes (not selectable values).
[ ] All dropdowns use the custom dark `Dropdown` component.
[ ] Brand strings read "OpenAI", "Anthropic", "Google Gemini".
[ ] Disabled buttons expose explanatory tooltips.