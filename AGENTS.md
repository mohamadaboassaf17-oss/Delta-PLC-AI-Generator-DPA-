# AGENTS.md — Delta PLC AI Generator (DPA)

## Provider Architecture (M11+)

All AI providers implement the `AiProvider` trait in `src-tauri/src/providers/`.
- OpenAI and Custom share request/response logic via `openai_compat.rs` (both use `/chat/completions` format).
- Anthropic and Gemini have dedicated modules due to differing request/response schemas.
- Custom Provider domains are NOT in the static CSP/allowlist. They are validated at runtime via `domain_trust.rs` (Trust on First Use). HTTPS required except `localhost`/`127.0.0.1`.
- System prompts (DVP cheatsheet) are injected via `role: "system"` for OpenAI/Anthropic/Custom, and via `systemInstruction` for Gemini — see `prompts/inject.rs`.

## Trust on First Use (M11.4)

Custom Provider endpoints are gated by a `TrustedDomainList` persisted at `<app_data_dir>/trusted_domains.json`. On the first request to a new domain, the frontend must show `TrustDomainModal` and call `trusted_domains_add` before the Rust backend will issue the HTTP request. SSRF protection: `domain_trust::classify_ssrf` blocks 169.254.x.x (cloud metadata) unconditionally and warns on private-IP ranges.

## Project Schema Version

- v2: original schema (id, name, timestamps, version=2, meta, optional io_table/generated/hmi_table/chat_history)
- v3: same as v2 but `version: 3`. Migration is automatic on read via `migrate_v2_to_v3`.

## Project Overview

Tauri v2 desktop app (Windows 10/11, 64-bit) for generating Delta DVP Series PLC code (ST, LD, IL) and HMI tag tables via LLM APIs (BYOK). React + Tailwind frontend, Rust backend core. See `DPA_PRD.md` for full product spec.

## Build / Lint / Test

```bash
# Frontend (React + TypeScript + Tailwind)
cd src/
npm install
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build
npm run lint         # ESLint (flat config)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (watch mode)
npm run test -- --run              # Single run, no watch
npm run test -- --run path/to/file # Single test file

# Tauri (Rust backend)
cd src-tauri/
cargo build          # Development build
cargo clippy -- -D warnings        # Lint all Rust code
cargo test           # All Rust tests
cargo test test_name               # Single test by name filter

# Full Tauri desktop app
npm run tauri dev    # Launch with hot-reload
npm run tauri build  # Production MSI/NSIS installer (≤20 MB target)
```

## Code Style

### TypeScript / React

- **Imports**: React first, then third-party libs, then `@/` path aliases, then relative. Server/backend before client if both present.
- **Formatting**: Prettier with default config. 2-space indent. Single quotes. No semicolons. Trailing commas in multi-line (ES5).
- **Types**: Strict mode (`strict: true` in tsconfig). Prefer `interface` over `type` for object shapes; `type` for unions, intersections, and primitives. Avoid `any` — use `unknown` and narrow.
- **Naming**: PascalCase for components and interfaces (`IOMappingTable`). camelCase for variables, functions, and instances (`ioTable`, `getIoMapping`). Prefix boolean flags with `is`/`has`/`should` (`isGenerating`, `hasApiKey`). Event handlers: `handle*` (`handleGenerate`). Props types: `{ComponentName}Props`.
- **Components**: React functional components only with explicit return types (`React.FC` is acceptable but explicit return is preferred). Keep components under 200 lines; extract sub-components and hooks. Use named exports for utilities/hooks; default exports only for page-level components routed by Tauri.
- **Hooks**: Extract shared logic into custom hooks in `src/hooks/`. Prefix with `use`. Single responsibility per hook.
- **Error handling**: Use React Error Boundaries for component trees. Async operations return `Result<T, AppError>` or `{ data, error }` shapes — never throw in event handlers. Display errors with a `<StatusBar>` or toast, never `alert()`.
- **State**: React Context + `useReducer` for global app state (project data, I/O table, API key presence). Local state for UI-only concerns (panel open/close, active tab). Avoid prop drilling beyond 2 levels.
- **Prompts / LLM calls**: All LLM prompt construction lives in `src/lib/prompts/`. Never inline raw prompts in components. Attach the I/O table as immutable context to every modification request (see PRD §7.2).
- **Debug UI**: Any performance monitors, debug panels, or dev-only overlays must be
  conditionally rendered: `{import.meta.env.DEV && <DebugPanel />}`. Never render
  debug UI in production builds.

### Rust (Tauri Backend)

- **Imports**: `std` first, then external crates, then `crate::` modules. Group related imports.
- **Formatting**: `rustfmt` with default settings. 4-space indent.
- **Types**: `#[derive]` all applicable traits (Debug, Clone, Serialize, Deserialize). Use `Result<T, Box<dyn Error>>` for library code; use a custom error enum with `thiserror` for application code.
- **Naming**: snake_case for functions, variables, modules. PascalCase for types, enums, structs. SCREAMING_SNAKE_CASE for consts/statics.
- **Error handling**: Use `anyhow` for application-level errors, `thiserror` for library-level. Prefer `.context()` to attach messages. Never `unwrap()` in production code — use `?` with `Result` or `.expect()` with a descriptive message only when the invariant is truly unrecoverable.
- **Commands**: Tauri commands (`#[tauri::command]`) go in `src-tauri/src/commands/` — one module per feature area (io_table, generation, project, settings). Validate all input with explicit types; never trust frontend payloads.
- **Security**: Store API key via OS keychain (`tauri-plugin-keychain` or `keyring` crate). Never log API keys. Sanitize file paths with `tauri::api::path::resolve`. Validate `.dpa` file extension before deserialization.

### CSS / Tailwind

- Use Tailwind utility classes exclusively; no custom CSS files unless absolutely necessary. Custom CSS only in `src/styles/` with a comment explaining why Tailwind couldn't handle it.
- Follow mobile-first responsive ordering: unprefixed → `sm:` → `md:` → `lg:`.
- Component variants extracted with `@apply` inside `@layer components` only if reused ≥3 times.

### File Naming & Structure

```
src/
  components/       # PascalCase.tsx (IOMappingTable.tsx)
  hooks/            # useCamelCase.ts  (useProject.ts)
  lib/              # camelCase.ts     (prompts.ts, api.ts)
  styles/           # kebab-case.css   (ladder-diagram.css)
  types/            # camelCase.ts     (project.ts, io.ts)
src-tauri/
  src/
    commands/       # snake_case.rs    (io_table.rs)
    models/         # snake_case.rs    (project.rs)
```

Always use the filename that matches the primary export.

## Key Patterns

- **Context Anchoring (PRD §7.2)**: When the user modifies generated code, include the full I/O table as a preamble in every LLM request. This prevents the model from reassigning reserved addresses.
- **Conflict Detection**: Before rendering generated code, run a post-processing pass to cross-reference addresses against the I/O table. Flag mismatches with red highlighting and halt rendering if conflicts exceed threshold.
- **Export Pipeline**: ST → LD conversion via custom algorithm (not LLM). The LLM produces ST; a deterministic Rust function maps ST to SVG/React Flow nodes for the ladder diagram view.
- **Project files**: `.dpa` files are JSON archives with a versioned schema (`version: 2`). Always validate schema version on load and provide migration paths.
- **DVP Address Validation**: All I/O addresses must pass `validate_dvp_address()` (Rust)
  before any use. Delta DVP uses octal numbering — X8/X9/Y8/Y9 are invalid.
  Frontend also validates inline; Rust validation is the authoritative layer.
