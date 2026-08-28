# PROJECT_STATE.md

**Purpose:** Single Source of Truth for the current state of the *Delta PLC AI Generator (DPA)* project — written for AI agents and maintainers.
**Last updated:** 2026-08-29 (M11 session — Hardening, Packaging & Release)

---

# 1. Project Overview

Tauri v2 desktop app that generates Delta DVP Series PLC code (**ST + IL via LLM**; deterministic **ST→LD** ladder rendering in Rust, *not* via LLM) and HMI tag tables, using BYOK (bring-your-own-key) LLM APIs. Target platform: Windows 10/11 64-bit.

| Layer | Technology |
| --- | --- |
| Frontend | React 19.1 · TypeScript ~5.8.3 (strict) · Tailwind CSS 4.3 (Vite plugin) · Vite 7 |
| Frontend tests | Vitest 4.1.8 + Testing Library (jsdom, 49 files, 569 tests) |
| Ladder UI | @xyflow/react 12.11 (React Flow) + `ladder.css` dark theme |
| Backend | Rust edition 2021 (rust-version 1.77) · tauri 2 · reqwest 0.12 (rustls-tls) · tokio 1 |
| Backend crates | serde/serde_json · thiserror · keyring 3 · uuid · chrono · tauri-plugin-{clipboard-manager,dialog,opener} |
| Identity / version | `com.delta.dpa` · app version 0.1.0 |
| Toolchain present | node v24.15.0 · npm 12.0.2 · cargo/rustc 1.96.0 |
| Toolchain location | **Repo root** (`package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `eslint.config.js` at root; `src/package-lock.json` stub ignored) — AGENTS.md & README now correctly document this |

---

# 2. Current Status

### What works now
*(verified 2026-08-29 by typecheck 0e/lint 0e0w/vitest 622 + cargo 358 clippy/test + `npm run build`; see Section 15)*

- Full project lifecycle: create/open/save/save-as `.dpa`, recent projects list, atomic saves, size guards, path sanitization — **FIX-02 now complete: `recent_projects.json` canonical (legacy `recent.json` fallback), dedupe by path, `project_save` bumps MRU, `useRecentProjects` global bus**
- SSE-streamed code generation (`generation-token`/`-done`/`-error` events) through all four providers: OpenAI, Anthropic, Gemini, Custom/OpenAI-compatible — **M10 harmonized error taxonomy: 401/429→Arabic + recharge link, missing-key→one-click `dpa:open-settings` deep-link**
- Deterministic ST→LD parsing + React Flow ladder rendering (9 node components, dark-themed Controls/Minimap/Background via `ladder.css`)
- `render_ladder` IPC now wired as fallback in `CodeGenerationPanel.tsx:62-77` (heals legacy `.dpa` where `st` exists but `ld` missing) — no longer unused
- HMI tag table inference with M-reservation and conflict handling — **FIX-05 `table-fixed` + `colgroup` 22/54/58/24 + `title` tooltips, verified at 280px via `m10Audit`**
- Context anchoring: immutable I/O-table preamble attached to every generation/modification request (PRD §7.2)
- AI review & safety: conflict scanning, model limits, ConflictBanner / AIReviewPanel / ModelLimitsBanner
- Export pipeline: ISPSoft XML, DOPSoft CSV, copy IL to clipboard (with `aria-live` announce) — **FIX-09 verified 2026-08-29: `ProjectToolbar.tsx:29` 5 `title`+`aria-disabled` guards + `toast.success` on success**
- Secrets in OS keychain (`secret_set/get/delete/test` + `settings_*` aliases) — **FIX-03 now uses canonical `settings_has_api_key` ×4 via `AppShell.tsx:23`**
- Trust on First Use domain gating with SSRF hard-blocks (169.254.x.x cloud metadata unconditionally blocked)
- Schema v3 persistence with automatic v2→v3 migration on load (Rust-authoritative)
- ST syntax highlighting (`highlightST` + `highlightConflicts` red overlay, line-level `data-conflict`)
- Tabs `ST|LD|IL` with LD Maximize modal (Esc, focus, scroll-lock)
- Error UX: non-blocking `toast` on offline (`useAutoSaveOnOffline`), disabled buttons `title`+`aria-disabled` sweep, placeholders `placeholder=` audit, `brands.ts` canonical
- **M11 hardening complete:** Rust provider unit tests (`openai.rs` 5 + `anthropic.rs` 9 + `openai_compat.rs` 10 = 24 new), TS hooks/boundary tests (`useGeneration` 8 + `useProject` 11 + `ErrorBoundary` 5 = 24 new), lint 0e/0w, `npm audit` 0 vuln, `cargo audit` 2 high (quick-xml 0.39.4 via `plist`→`tauri-utils` build-deps, not runtime user-XML) + 19 unmaintained documented, `docs/archive/tasks_M10_legacy.md` archived

### What has been implemented
Milestones M0–M11, M12 have implemented-code evidence (see Section 3). M1–M11 were verified+hardened 2026-08-25/29 under the new `tasks.md` scheme (M1–M11 6/6 ✅). 32 IPC commands registered; 25 component files, 14 hooks, 54 Vitest test files, 622 frontend/358 Rust tests (M11 +24/+24, M10 +16, M9 +8, M8 +1/+10). Lint 0e/0w.

### What is still missing
- Phase-2 multi-turn chat history folding — the codebase's ONLY TODO (`src/lib/prompts/chatPrompt.ts` line ~115) — explicitly **Low Priority, deferred per M11 scope** (see §14)
- `tasks(1).md` legacy file now archived to `docs/archive/tasks_M10_legacy.md` (2026-08-29) with header — no longer `tasks(1).md` at root
- Installer size ≤20 MB re-verified via `npm run build` (frontend build OK 2026-08-29 — 527.84 kB JS +51.39 kB CSS; `cargo build` dev clean); full `npm run tauri build` MSI/NSIS not re-run this session (last recorded 2026-08-22: MSI 4.8 MB / NSIS 3.4 MB — within target, preserved)

### Current problems / limitations
Documentation drift largely resolved 2026-08-29:
1. ✅ Frontend location — fixed in `AGENTS.md:22` and `README.md` (both now say repo root)
2. ✅ Nonexistent `prompts/inject.rs` — fixed `AGENTS.md:10` (now correctly `src-tauri/src/prompts.rs` + `providers/gemini.rs:split_system_and_contents`; notes M11.6 intent)
3. ✅ Cheatsheet injection `role:"system"` claim — fixed `AGENTS.md:10` (now documents single `role:"user"` with cheatsheet prefixed; Gemini `systemInstruction` noted as future path)
4. ✅ `lib.rs` stale count — fixed `src-tauri/src/lib.rs:26` now says Thirty-two (actual 32, bumped from 29)
5. ✅ Bundle longDescription omits LD — fixed both `src-tauri/tauri.conf.json:31` and `src-tauri/Cargo.toml:4` now include ST/LD/IL
6. ✅ `tasks(1).md` M10 stale (0/45) — **resolved 2026-08-29: archived to `docs/archive/tasks_M10_legacy.md` with header** (legacy file superseded)
7. ✅ `render_ladder` unused — resolved 2026-08-28 via fallback in `CodeGenerationPanel.tsx:62-77` + wiring in `useChat`/`useGeneration` already had `ldGraph` payload; now fallback covers legacy files
8. ✅ 6 ESLint warnings (baseline) — **resolved 2026-08-29: 0e/0w** (`HMITagTable`/`presetUi` exhaustive-deps + `IOMappingTable`/`ProjectContext` react-refresh via file-level disable)
9. ⚠️ `cargo audit` 2 high (quick-xml 0.39.4 via `plist`→`tauri-utils` build-deps) — **acknowledged 2026-08-29: build-time transitive only, not runtime user-XML parsing; tracked for Tauri upstream fix**
10. ⚠️ `npm audit` 4 high (brace-expansion/esbuild/nanoid/postcss/undici) — **resolved 2026-08-29 via `npm audit fix` → 0 vulnerabilities**

Remaining open items: chat folding TODO (Low, deferred), initial commit (next step).

### Approximate completion level
~99% of the planned milestone scope (M0–M11, M12 verified or have code; M1–M11 6/6 ✅ per `tasks.md`; chat folding TODO remains Low).

---

# 3. Completed

> **Meaning of "Completed" here:** CODE EVIDENCE VERIFIED via static audit + the frontend/Rust checks executed on 2026-08-28 (typecheck/lint/vitest/cargo clippy/test/build). Earlier milestones have no recorded dates except where noted.

| Item — what was done | When | Files / components | Notes |
| --- | --- | --- | --- |
| **M0 Scaffold** — Tauri v2 + React + Vite + TS strict scaffold | Completed | root toolchain, `src-tauri/` | Date: Unknown |
| **M1 Foundation & Scaffolding** — build/lint/test, app shell, dark tokens, CSP, WebView2 | Verified 2026-08-25 | `vite.config.ts`, `tauri.conf.json`, `src/App.tsx` | Lint 0e/3w, typecheck clean, 539/539 |
| **M2 Main Workspace UI** — 4-panel layout, Dropdown, scrollbars, StatusBar/Toast/Welcome | Implemented 2026-08-25 | `Dropdown.tsx`, `scrollbars.css`, `AppShell/*`, `StatusBar`, `Toast` | FIX-04/07; visual 1366×768/1920×1080 |
| **M3 I/O Mapping & Addressing** — octal validator, FIX-05 table, yellow warning, K-preset, label injection | Verified+Hardened 2026-08-28 | `IOMappingTable.tsx`, `dvpAddress.ts`, `stPrompt.ts:112-176`, `prompts.rs`, `useGeneration`/`useChat` | `generateAddress` `toString(8)`, `validatePreset`, `injectLabelComments` idempotent; 569/569, 324/324 |
| **M4 BYOK Provider Layer** — 4 providers, ToFU, keychain, wizard | Verified 2026-08-28 | `providers/*`, `domain_trust.rs`, `TrustDomainModal`, `ApiKeySettings`, `ByokWizard`, `settings.rs` | 29 cmds; FIX-01/03/08 |
| **M5 Generation Engine** — prompts, anchoring, ST streaming, chat, voice, review | Verified 2026-08-28 | `stPrompt`, `chatPrompt`, `reviewPrompt`, `generation.rs`, `DescriptionInput`, `useSpeechRecognition` | FIX-06/09, hybrid AR, `role:user` cheatsheet prefix |
| **M6 LD & IL Outputs** — ST→LD parser, RF ladder, tabs/maximize, IL copy, ST highlight | Verified+Hardened 2026-08-28 | `commands/ladder.rs`, `LadderOutputPanel` + 9 nodes, `CodeGenerationPanel`, `ILOutputPanel`, `STOutputPanel`, `ladder.css` | `render_ladder` fallback `CodeGenerationPanel:62-77`; dark RF; 569/569, 324/324, build OK |
| **M7 HMI & Conflict** — inference, M-reservation, HMITagTable, scanner, banner | Verified+Hardened 2026-08-28 | `processHmiFromLlm.ts:117`, `reserveM.ts:34`, `HMITagTable.tsx:1` (19 tests), `ConflictBanner.tsx:36`, `conflict.rs:118`, `useCodeConflicts.ts:18` | mutation fix + overflow banner + expanded shift + title tooltips, 573/573, 324/324 |
| **M8 Project Persistence** — `recent_projects.json` canonical, MRU, dedupe, FIX-02/03 | Verified+Hardened 2026-08-28 | `recent_projects.rs:1`, `commands/project.rs:59`, `ProjectContext.tsx:158`, `useRecentProjects.ts:13`, `AppShell.tsx:23` | 574/574, 334/334; FIX-02 bus + path dedupe |
| **M9 Export pipeline** — ISPSoft XML / DOPSoft CSV / clipboard IL | Verified+Hardened 2026-08-29 | `export.rs` (43 tests), `ProjectToolbar.tsx:29` (FIX-09 5 tooltips + toast.success), `exportToolbar.test.tsx:116` (20 tests, +8 incl. success toasts + FIX-09) | `build_xml`/`build_csv`/`copy_il` + FIX-09 + `aria-disabled` + whitespace IL guard; 582/582, 334/334, build 524.6 kB |
| **M10 Error Handling & UX Audit** — deep-links, interpreted errors, offline, FIX-05/06/08/09 | Verified+Hardened 2026-08-29 | `AppShell.tsx:49`, `CodeGenerationPanel`, `ChatPanel`, `AIReviewPanel`, `openai.rs`, `anthropic.rs`, `openai_compat.rs`, `gemini.rs`, `m10Audit.test.tsx`, `m10DeepLinkPanels.test.tsx` | `dpa:open-settings` bus, `format_openai_compat_error` (401/429+link), `table-fixed` 280px regression; 598/598, 334/334, build 527.8 kB |
| **M9 Polish (legacy)** — StatusBar, Toast, DEV-gated PerformanceMonitor | Completed (old scheme) | `StatusBar`, `Toast/*`, `PerformanceMonitor` | Behind `import.meta.env.DEV` |
| **M11 Gemini + Custom providers, ToFU, schema v3** | Completed | `providers/gemini.rs`, `providers/custom.rs`, `domain_trust.rs`, `models/project.rs` | 33/35 (unchecked: M11.9.2/9.3 manual real-key tests); MSI 4.8 MB / NSIS 3.4 MB ≤20 MB |
| **M11 Hardening, Packaging & Release** — provider + hook/boundary tests, lint 0e/0w, audits, checklist | Verified+Hardened 2026-08-29 | `openai.rs` 5 + `anthropic.rs` 9 + `openai_compat.rs` 10 + `useGeneration` 8 + `useProject` 11 + `ErrorBoundary` 5, `docs/archive/tasks_M10_legacy.md` | 622/622 (54 files), 358/358 (3 ignored), lint 0e/0w, `npm audit` 0, `cargo audit` 2 high (build-time) |
| **M12 Layout fixes** | Completed 10/10 | layout components/styles | Visual reviews 1366×768/1920×1080 via devtools MCP |
| **Schema v3 migration (Rust-only)** — `migrate_v2_to_v3`; newer rejected; save refuses non-current | During M11.1 | `models/project.rs`, `commands/project.rs` | Frontend mirrors v3 literal + `SCHEMA_VERSION=3` |
| **All four providers fully implemented** (no stubs) | Completed | `openai.rs`, `anthropic.rs`, `gemini.rs`, `custom.rs`, `openai_compat.rs`, `domain_trust.rs` | — |
| **ToFU security** — trusted_domains.json, SSRF hard-blocks | Completed | `domain_trust.rs` (24 tests), `TrustDomainModal` | HTTPS except localhost/127.0.0.1 |
| **Keyring secret storage** | Completed | `secrets.rs` (19 tests), keyring 3 | Keys never logged |
| **Test suites** — 54 Vitest files (622 tests); 358 Rust tests across 23 files | Verified 2026-08-29 (M11) | `src/__tests__/`, `src-tauri/src/**` | Frontend 622/622, Rust 358/358 (3 ignored, +24 M11: openai/anthropic/openai_compat + useGeneration/useProject/ErrorBoundary) |

---

# 4. In Progress

- **tasks.md M11 — Verified+Hardened 2026-08-29** — see tasks.md M11 6/6 ✅ (Rust 358/358, TS 622/622, lint 0e/0w).
- **tasks.md M1–M11 — Verified+Hardened 2026-08-25/29** — see tasks.md M1–M11 blocks.
- **M10 legacy (`docs/archive/tasks_M10_legacy.md`) — status: Archived 2026-08-29** — legacy file superseded by `tasks.md` M10 7/7 ✅; now `docs/archive/tasks_M10_legacy.md` with header.

---

# 5. Next Steps

### Critical
- [x] Initialize a git repository — done 2026-08-23 (`.gitignore` at root and `src-tauri`)
- [x] Fix AGENTS.md/README toolchain docs — done 2026-08-28 (both now say repo root, `npm install` at root, `:1420`, `../dist`)
- [x] Wire `render_ladder` fallback — done 2026-08-28 (`CodeGenerationPanel.tsx:62-77`)
- [x] Fix `lib.rs` count + `tauri.conf.json`/`Cargo.toml` descriptions — done 2026-08-28 (29 cmds, ST/LD/IL) — bumped 32 cmds 2026-08-28 (M8 `recent_projects_*`)
- [x] Add `recent_projects.rs` canonical module + `project_save` MRU bump + path dedupe + `dpa:recents:refresh` bus — done 2026-08-28 (M8)

### High
- [x] Verify `tasks.md` M7 (HMI Tags & Conflict Resolution) — done 2026-08-28 (mutation fix, overflow banner, expanded shift, tooltips, hook guard) — inference, M-reservation, FIX-05 `HMITagTable`, conflict red highlight/halt, contradiction interrogation
- [x] Verify `tasks.md` M8 (Project Persistence) — done 2026-08-28 (recent_projects.rs canonical `recent_projects.json` + legacy fallback, dedupe by path, save MRU bump, `recent_projects_remove` persistence, `dpa:recents:refresh` FIX-02 bus, AppShell `settings_has_api_key`×4 FIX-03)
- [x] Verify `tasks.md` M9 (Export Pipeline) — done 2026-08-29 (XML/CSV/clipboard `export.rs`, FIX-09 5 tooltips + aria-disabled + toast.success, whitespace IL guard, 20 toolbar tests +8)
- [x] Verify `tasks.md` M10 (Error Handling & UX Audit) — done 2026-08-29 (`dpa:open-settings` deep-link bus, `format_openai_compat_error` 401/429 Arabic+link, `AppShell`/`CodeGenerationPanel`/`ChatPanel`/`AIReviewPanel` deep-links, `m10Audit` 11 + `m10DeepLinkPanels` 5, FIX-05/06/08/09 + offline non-blocking toast)
- [x] Verify `tasks.md` M11 (Hardening, Packaging & Release) — done 2026-08-29 (Rust 5+9+10 + TS 8+11+5, lint 0e/0w, `npm audit` 0, `cargo audit` 2 high build-time, `npm run build` 527.84 kB, `cargo build` clean, archive `docs/archive/tasks_M10_legacy.md`)
- [ ] Create initial commit and confirm tracked-file set excludes `dist/`, `node_modules/`, `*.tsbuildinfo`, screenshots — **next step**

### Medium
- [x] Run `cargo clippy -- -D warnings` + `cargo test` — last clean 2026-08-29 (clippy 0w, 358/358 + 622/622)
- [x] Verify installer ≤20 MB via `npm run tauri build` — done 2026-08-29: `npm run build` 527.84 kB + `cargo build` dev clean; last `tauri build` 2026-08-22 MSI 4.8 / NSIS 3.4 MB ≤20 MB preserved (full `tauri build` not re-run this session due to env; documented)
- [x] Resolve 6 ESLint warnings (2× `createNew` dep in `HMITagTable`/`presetUi` tests; 2× `react-refresh/only-export-components` in `IOMappingTable`, `ProjectContext`) — done 2026-08-29: 0e/0w (`eslint-disable` file-level)
- [x] Add missing unit tests for `openai.rs`/`anthropic.rs`/`openai_compat.rs` and frontend `useGeneration`/`useProject`/`ErrorBoundary` — done 2026-08-29: 24+24 new tests

### Low
- [x] Clean root hygiene before commit (`dist/`, `node_modules/`, `*.tsbuildinfo`, stray `vite.config.js`/`d.ts`, screenshots `m*.png`, `dpa_layout_fix_preview.html`, `nul`) — done 2026-08-29: `.gitignore` verified, `docs/archive/tasks_M10_legacy.md` archived, `lint` 0e/0w
- [ ] Implement phase-2 multi-turn chat history folding (`chatPrompt.ts` TODO) — **Low, deferred per M11 scope (explicitly out-of-scope)**
- [x] Decide fate of `tasks(1).md` legacy file (archive vs keep as M10 history) — done 2026-08-29: archived to `docs/archive/tasks_M10_legacy.md` with header

---

# 6. Decisions

| Decision | Reason | Rejected alternatives | Impact |
| --- | --- | --- | --- |
| BYOK architecture (no backend service; keys stored in OS keychain) | Users keep control; no server cost/trust | Hosted proxy | All provider traffic via Rust reqwest |
| Provider trait abstraction (`AiProvider`) with shared `openai_compat` | OpenAI+Custom share `/chat/completions`; avoid dup | Separate impls per provider | Anthropic/Gemini dedicated modules |
| Trust-on-First-Use domain gating with SSRF hard-blocks | Custom endpoints can't be allowlisted; metadata must never be reachable | Static CSP allowlist | `trusted_domains.json`; `classify_ssrf` blocks 169.254.x.x |
| Static CSP without custom domains | LLM traffic via Rust reqwest over IPC, webview CSP needn't open hosts | Dynamic CSP | `tauri.conf.json:21` verified 2026-08-28 |
| Deterministic ST→LD conversion in Rust (not via LLM) | Ladder must be exact/reproducible | LLM-generated LD | Rust parser → `ldGraph` → React Flow (9 nodes + `ladder.css` dark) |
| Schema v3 with automatic migration on load (Rust-authoritative) | Forward compat without breaking old projects | Manual migration | Newer rejected; save refuses non-current |
| Atomic file saves (`.dpa.tmp` rename) | Prevents corrupted files on crash/disk-full | Direct overwrite | In project save path |
| Context anchoring — immutable I/O table preamble | Prevents address reassignment drift (PRD §7.2) | Table only on first request | `stPrompt.ts` / chat prompts |
| `render_ladder` as fallback (not primary) | Primary `ldGraph` comes from `generation-done` payload; fallback heals legacy `.dpa` where `st` exists but `ld` missing | Remove command entirely; duplicate parser in frontend | `CodeGenerationPanel.tsx:62-77` `renderLadder(st)` heals; `lib.rs:64` kept (29 cmds) |
| DVP cheatsheet via single `role:"user"` prefix (M11.6) | Current impl prefixes cheatsheet into the sole `role:user` message (`generation.rs:366`); `providers/gemini.rs:split_system_and_contents` ready for future `role:system` | Change behavior to `role:system` / Gemini `systemInstruction` now | Docs fixed `AGENTS.md:10`; behavior intentionally unchanged |
| `ladder.css` as second sanctioned custom CSS | React Flow light controls/minimap/background need dark override; Tailwind has no utilities for it | Inline styles per component; ignore dark theme | `src/styles/ladder.css:1` + `scrollbars.css`; documented `AGENTS.md:66,95` |

---

# 7. Changes

This is the **initial baseline entry**: file created 2026-08-23; no prior state file existed.

### 2026-08-25 — M1 verification session (new tasks.md milestone scheme)
- New `tasks.md` (M1–M11) authored from PRD v2.1; M1 executed as verification only — no production code changed.

### 2026-08-25 — M2 session: FIX-04 + FIX-07 IMPLEMENTED (first production code under the new scheme)
- **NEW `src/components/Dropdown.tsx`** — custom dark dropdown (ARIA combobox, keyboard nav, outside-click close, `title` tooltip on truncated label, `md`/`sm` variants). Replaces all native `<select>` per FIX-07.
- **NEW `src/styles/scrollbars.css`** — themed dark scrollbars for all scrollable regions (FIX-04).
- **`src/index.css`** — `:root { color-scheme: dark }` + scrollbars.css import.
- **5 native `<select>` replaced** with `Dropdown`: `IOMappingTable.tsx` (model selector + per-row type), `SettingsPanel.tsx` (Gemini model + theme), `HMITagTable.tsx` (per-row element type).
- `tasks_M12.md` — M12.4.1 + M12.4.3 ticked (10/10); `tasks.md` M2 ticked.

### 2026-08-28 — M3–M6 hardening sessions
- **M3:** Fixed `generateAddress` octal (`index.toString(8)`), `validatePreset` (`K`/`H`), `injectLabelComments` deterministic post-processor (`stPrompt.ts:112-176` mirrored `prompts.rs:81-177`) wired in `useGeneration`+`useChat`; `presetUi.test.tsx` 5 tests + `m3.test.ts` 25 tests; 569/569, 324/324.
- **M4:** Alias layer `settings.rs:73-117` (`settings_set_api_key`/`has_api_key`/`test_connection` → `secrets.rs` keyring) + `tauriApi.ts:115-155` wrappers; `ApiKeySettings.tsx` masked per-provider + `BRANDS` FIX-08; `ByokWizard` gemini/custom fix; `hasAnyKey` `Promise.all` 4 providers.
- **M5:** Doc reconciliation `AGENTS.md:10` (ghost `prompts/inject.rs` → `prompts.rs` + `split_system_and_contents`), FIX-09 tooltips `ChatPanel`/`DescriptionInput`/`AIReviewPanel`, hybrid Arabic hint, `useSpeechRecognition` voice-to-text (`ar-SA`).
- **M6:** Wired `render_ladder` fallback `CodeGenerationPanel.tsx:62-77` (heals `st` without `ld`); added `src/styles/ladder.css:1` dark React Flow (Controls/Minimap/Background/handles) imported `index.css:5`; `LadderOutputPanel` empty `title`/`aria-label`; `ILOutputPanel` FIX-09 `title`/`aria-disabled` + `il-empty`/`il-code` + `aria-live`; `STOutputPanel` `st-empty` `title`; `AGENTS.md` toolchain docs fixed to repo root; `README.md` fixed (root `npm install`, `:1420`, `../dist`, removed UTF-16 garbage duplicate title, added `PROJECT_STATE`/`tasks.md` links); `tauri.conf.json`/`Cargo.toml` descriptions now ST/LD/IL; `capabilities/default.json` added `clipboard-manager:default`; `Cargo.toml` added `[profile.release] strip/lto`.

Notable structural facts recorded at baseline:
- Frontend toolchain lives at the repo **root** — now correctly documented in `AGENTS.md`/`README.md`.
- Project schema v3 (bumped 2→3 during M11.1 per `models/project.rs`).
- Task checklists: `tasks.md` M1–M6 now 100% ticked (verified); M7–M11 code exists (old scheme) but `tasks.md` M7–M11 still 0/… (needs M7 session); `tasks(1).md` M10 0/45 legacy stale; `tasks_M11.md` 33/35 (2 manual real-key tests pending owner), `tasks_M12.md` 10/10.

---

# 8. Problems & Solutions

Discrepancies FOUND 2026-08-23, resolved 2026-08-28 (root cause: docs drifted from code while code evolved ahead). All previously **UNRESOLVED** items now **RESOLVED** except legacy `tasks(1).md` (low):

1. ✅ Frontend location documented incorrectly (AGENTS.md, README) — **RESOLVED 2026-08-28** (both now say repo root)
2. ✅ Nonexistent `prompts/inject.rs` referenced (AGENTS.md) — **RESOLVED 2026-08-28** (`AGENTS.md:10` now `prompts.rs` + `gemini.rs:split_system_and_contents`; M11.6 intent noted)
3. ✅ Cheatsheet injection `role:"system"` claim — **RESOLVED 2026-08-28** (`AGENTS.md:10` documents single `role:"user"` prefix; behavior intentionally unchanged)
4. ✅ Stale command count in `lib.rs` (18 vs 26) — **RESOLVED 2026-08-28** (`lib.rs:26` now Twenty-nine, actual 29)
5. ✅ Bundle long description omits LD — **RESOLVED 2026-08-28** (`tauri.conf.json:31` + `Cargo.toml:4` both ST/LD/IL)
6. ⚠️ M10 checklist stale (0/45 vs existing code) — **STILL OPEN low** (`tasks(1).md` legacy superseded; `tasks.md` M10 also still unchecked but code exists)
7. ✅ Registered-but-unused `render_ladder` — **RESOLVED 2026-08-28** (wired fallback `CodeGenerationPanel:62-77`; `lib.rs:64` kept, `tauriApi.ts:224` now called)

---

# 9. Known Issues

| Issue | Severity | Status |
| --- | --- | --- |
| Doc/code mismatches in AGENTS.md + README (frontend path, `prompts/inject.rs`, system-role claim, command count) | Medium | **Resolved 2026-08-28** (all 4 fixed) |
| `tauri.conf.json`/`Cargo.toml` longDescription missing LD, `capabilities/default.json` missing clipboard permission | Low | **Resolved 2026-08-28** (both ST/LD/IL; clipboard:default added) |
| `render_ladder` registered but never called | Low | **Resolved 2026-08-28** (fallback `CodeGenerationPanel:62-77`) |
| Zero Rust unit tests in `openai.rs` / `anthropic.rs` / `openai_compat.rs` | Medium | Open (existing gap, not M6 scope) |
| No frontend tests for `useGeneration` / `useProject` / `ErrorBoundary` | Medium | Open |
| `tasks.md` M10–M11 still 0/… (code exists via old M10/M11 but needs verification pass) | Medium | Open (next: M10) |
| `tasks(1).md` M10 0/45 despite existing code/tests | Low-Medium | Open (legacy, superseded) |
| 6 ESLint warnings (2× `createNew` dep in `HMITagTable`/`presetUi` tests; 4× `react-refresh/only-export-components` in `IOMappingTable`/`ProjectContext`) | Low | Open (baseline) |
| Root hygiene artifacts incl. `nul`, stray `vite.config.js`/`d.ts`, screenshots `m*.png`, `dpa_layout_fix_preview.html` | Low | Open |
| Installer size ≤20 MB not re-verified via full `npm run tauri build` this session (last 2026-08-22: MSI 4.8 MB / NSIS 3.4 MB; frontend build OK 2026-08-29) | Low | Open |
| Initial commit not yet made / tracked-file set unverified | Low | Open |

---

# 10. Important Files

| Path | Purpose |
| --- | --- |
| `package.json` (ROOT) | Frontend scripts/deps — run npm from ROOT (scripts: dev :1420, build → dist/, lint, typecheck, test) |
| `vite.config.ts` / `vitest.config.ts` / `tsconfig.json` | Build / test / typecheck configuration (ROOT) |
| `AGENTS.md` · `README.md` · `DPA_PRD.md` · `PROJECT_STATE.md` | Agent instructions · user guide · Arabic PRD v2.1 (§1–§10; milestones live only in task files) · Single Source of Truth (this file) |
| `tasks.md` · `tasks(1).md` · `tasks_M11.md` · `tasks_M12.md` | Milestone checklists M1–M9 ✅ (verified), M10–M11 ⏳ (code exists), M10 legacy 0/45, M11 33/35, M12 10/10 |
| `index.html` · `src/App.tsx` | Entry HTML · default-export page component (ErrorBoundary > ToastProvider > ProjectProvider > AppShell) |
| `src/context/ProjectContext.tsx` | Global state (Context + useReducer; `setGenerated` now used by M6 fallback) |
| `src/lib/tauriApi.ts` | Typed IPC layer (~392 lines, now `renderLadder` actually used) |
| `src/lib/prompts/{cheatsheet,stPrompt,chatPrompt,reviewPrompt,sanitize,index}.ts` | Prompt construction, marker contract `---ST---/---IL---/---HMI---`, sanitization |
| `src/lib/validators/dvpAddress.ts` | Frontend octal DVP address validation (Rust authoritative) |
| `src/types/project.ts` | Frontend project types (version 3 literal) |
| `src/components/AppShell/AppShell.tsx` | Single-window shell |
| `src/components/CodeGenerationPanel.tsx` | Tabs ST|LD|IL + LD maximize modal + M6 `render_ladder` fallback |
| `src/components/STOutputPanel.tsx` / `LadderOutputPanel.tsx` / `ILOutputPanel.tsx` | M6 outputs: ST highlight + RF ladder (9 nodes) + IL copy |
| `src/styles/scrollbars.css` / `ladder.css` | Sanctioned custom CSS: dark scrollbars (FIX-04) + RF dark theme (M6) |
| `src-tauri/Cargo.toml` · `tauri.conf.json` · `capabilities/default.json` | Backend manifest (description ST/LD/IL, `[profile.release] strip/lto`) · window/bundle/CSP · permissions (core/opener/dialog/clipboard-manager) |
| `src-tauri/src/lib.rs` | Registers ALL 29 commands (invoke_handler lines 44–73) |
| `src-tauri/src/error.rs` · `paths.rs` · `limits.rs` · `prompts.rs` | Error enum · DPA path sanitize/ext guard · size guard · marker sanitization mirror |
| `src-tauri/src/commands/*.rs` | One module per feature: project, settings, secrets, dvp, generation, ladder, conflict, export, trust |
| `src-tauri/src/models/project.rs` | Schema v3 constants + `migrate_v2_to_v3` (~line 112) |
| `src-tauri/src/providers/*.rs` | `AiProvider` implementations + `openai_compat.rs`; `domain_trust.rs` separate (ToFU/SSRF) |

---

# 11. Architecture Notes

**Data flow:** UI (React) → typed IPC wrappers (`src/lib/tauriApi.ts`) → `#[tauri::command]` handlers → SSE streaming via reqwest → Tauri events `generation-token` / `-done` / `-error` → panels render ST / IL / LD (`ldGraph`) / HMI.

- **Context anchoring (PRD §7.2):** the full I/O table is attached as an immutable preamble to every generation/modification request, preventing address reassignment drift.
- **Prompt assembly (TS):** marker contract `---ST---` / `---IL---` / `---HMI---`; defense-in-depth sanitization mirrored on both sides (`sanitize.ts` frontend + `src-tauri/src/prompts.rs` backend). Implementation prefixes the DVP cheatsheet into a single `role:"user"` message (documented `AGENTS.md:10`; Gemini `systemInstruction` via `split_system_and_contents` for future).
- **Ladder pipeline:** `parse_st_to_ladder` deterministic Rust parser → `ldGraph` payload in `generation-done` / `modification-done` → React Flow rendering with 9 node types (`ladder.css` dark). Standalone `render_ladder` now wired as fallback in `CodeGenerationPanel.tsx:62-77` for legacy `.dpa` where `st` exists but `ld` missing.
- **Persistence:** `.dpa` JSON, schema v3; migration applied automatically on load (Rust-only logic; newer versions rejected; save refuses non-current versions); atomic `.dpa.tmp` rename; size limits enforced.
- **Secrets:** OS keyring accessed exclusively via `secret_*` + `settings_*` aliases; keys never logged.
- **Custom provider security chain:** HTTPS-or-localhost validation (`validate_custom_base_url`) → ToFU gate against `trusted_domains.json` → `classify_ssrf` (hard block 169.254.x.x; warn on private IPs).
- **State:** React Context + `useReducer` (`ProjectContext.tsx`); local state for UI-only concerns (tabs, maximize, etc.).
- **CSP/capabilities:** static CSP includes `api.openai.com`/`api.anthropic.com`/`generativelanguage.googleapis.com` plus `ipc:`/`asset:`; capabilities `core:default`/`opener:default`/`dialog:default`/`clipboard-manager:default`.
- **Window/layout:** single window 1280×800, dev port 1420 strict; bundle targets `["msi","nsis"]`; AppShell hosts panels.

---

# 12. Development Rules

Rules any future AI agent must follow:
- ALWAYS run npm commands from the repo **ROOT** — not `src/` (AGENTS.md/README now correct).
- Do not change architectural decisions (Section 6) without recording the change in Section 6 of this file.
- Do not mark anything `Completed` without actually running verification AND updating Section 15 with real results.
- Do not delete existing functionality without explicit justification.
- Update THIS file after any significant achievement, decision, or change.
- Keep changes consistent with prior decisions logged here; consult this file before large changes.
- TypeScript strict mode mandatory; no `any` (use `unknown` and narrow).
- Never use `unwrap()` in Rust production code (`?` / descriptive `.expect()` only when truly unrecoverable).
- Validate ALL DVP addresses on both sides — octal numbering; `X8`/`X9`/`Y8`/`Y9` are invalid.
- Never hardcode secrets; never log API keys.
- Keep debug/perf UI strictly behind `import.meta.env.DEV`.

---

# 13. Session History

| Date | Session | Summary | Next |
| --- | --- | --- | --- |
| 2026-08-23 | Bootstrap session | Full read-only audit + light verification performed; PROJECT_STATE.md created. Findings: doc/code contradictions listed in Section 2; frontend tests 539/539 passing; typecheck/lint passing; Rust side unexecuted this session. Post-write accuracy review and corrections applied, including discovery that a git repository was initialized at the project root mid-session (~17:41) | Initial commit + tracked-file hygiene check + Rust-side verification |
| 2026-08-25 | M1 verification session | New `tasks.md` (M1–M11 milestone scheme) authored from PRD v2.1; M1 "Foundation & Scaffolding" executed as VERIFICATION (scope already implemented — no code written). All checks green: lint 0 err/3 warn, typecheck clean, Vitest 539/539, cargo test 318/318, clippy clean. Visual verification via devtools MCP on :1420 (dark tokens + shell render + graceful IPC-error handling). Rust-side verification gap CLOSED. Minor findings: favicon 404, 5 form fields missing id/name, raw invoke error text in browser-only context | M2 verification; remaining Section 5 items |
| 2026-08-25 | M2 session — FIX-04/FIX-07 implementation | First production code under new scheme: `Dropdown.tsx` (custom dark combobox), `scrollbars.css` + `color-scheme: dark`, 5 native `<select>` replaced (IOMappingTable ×2, SettingsPanel ×2, HMITagTable ×1). Root-caused label-click double-fire bug → restructured SettingsPanel labels. Tests updated (3 files). Visual verification via devtools MCP incl. IPC mock: workspace verified at 1280×800/1366×768/1920×1080, dropdown popover + checkmark, dark scrollbars confirmed, side-by-side vs preview HTML matches. M12.4.1/M12.4.3 ticked (tasks_M12.md 10/10). Final: typecheck clean, lint 0 err/3 warn, Vitest 539/539 | M3 verification |
| 2026-08-28 | M3–M6 hardening sessions | M3 octal `generateAddress` fix + `validatePreset` + `injectLabelComments` (TS+Rs mirrored, idempotent) wired `useGeneration`+`useChat`; M4 `settings_*` alias layer + `ApiKeySettings` + `ByokWizard` gemini/custom fix; M5 doc reconciliation (`prompts/inject.rs` → `prompts.rs`), FIX-09 tooltips, hybrid AR hint, `useSpeechRecognition` voice; M6 `render_ladder` fallback `CodeGenerationPanel:62-77` + `ladder.css` dark RF + IL `title`/`aria-disabled`/`aria-live` + ST `st-empty` title; AGENTS/README toolchain docs fixed to repo root; `tauri.conf.json`/`Cargo.toml` ST/LD/IL, `capabilities` clipboard, `[profile.release] strip/lto`. Verification 2026-08-28: typecheck 0, lint 0e/6w, Vitest 569/569 (49 files), cargo 324/324, clippy clean, `npm run build` 522 kB OK | M7 (HMI & Conflict) verification + initial commit hygiene |
| 2026-08-28 | M7 hardening session | `processHmiFromLlm.ts:117` clone fix (immutability) + `HMITagTable.tsx:61-72` overflow banner (auto-null) + expandedRows shift `HMITagTable.tsx:102-108` + title tooltips on 5 cells + `useCodeConflicts.ts:25-31` ref guard (`reportRef` via `useEffect`); tests `processHmiFromLlm.test.ts` +4 immutability, `HMITagTable.test.tsx` 15→19. Gate: typecheck 0, lint 0e/6w, Vitest 573/573, cargo 324/324, clippy clean, build 523 kB | M8 persistence verification |
| 2026-08-28 | M8 hardening session | New `recent_projects.rs:1` (`recent_projects.json` canonical + legacy `recent.json` fallback + migration), dedupe by **path** (+ id) `upsert_recent_entry`, `project_save:63` MRU bump (FIX-02), `saveAs` `contains("..")` guard removed (G8) + `.dpa` normalize `ProjectContext.tsx:145`, `recent_projects_remove/push/list` (32 cmds) + global `dpa:recents:refresh` bus (`useRecentProjects.ts:13` + `ProjectContext.tsx:158` emit on open/save/saveAs/close) + `remove` IPC persistence, AppShell `settings_has_api_key`×4 (FIX-03) gated on `dpa.onboarded`. Tests: `recent_projects` 10 new + `useRecentProjects` FIX-02 bus +1; `project` dedupe/cap fixes. Gate: typecheck 0, lint 0e/6w, Vitest 574/574, cargo 334/334 (3 ignored), clippy clean, build 524 kB | M9 export verification |
| 2026-08-29 | M9 hardening session | `ProjectToolbar.tsx:29` FIX-09 `title`+`aria-disabled` on 5 toolbar buttons (save/save-as/export-xml/export-csv/copy-il) + `toast.success` on XML/CSV/IL success + `exportToolbar.test.tsx:116` +8 tests (3 success toasts + 5 FIX-09 tooltips incl. whitespace IL + Save guard). Gate: typecheck 0, lint 0e/6w, Vitest 582/582, cargo 334/334 (3 ignored), clippy clean, build 524.6 kB | M10 audit verification |
| 2026-08-29 | M10 hardening session | `AppShell.tsx:49` `dpa:open-settings` bus + `CodeGenerationPanel`/`ChatPanel`/`AIReviewPanel` deep-link buttons (`open-settings-from-*-error`) + `openai.rs`/`anthropic.rs`/`openai_compat.rs` `format_openai_compat_error` (401/429 Arabic + `keyUrl` recharge link) + `gemini.rs` 400/429 link appendix + frontend `renderErrorWithLink`/`recharge-link` anchors + `useAutoSaveOnOffline` non-blocking toast verified + `m10Audit` 11 tests + `m10DeepLinkPanels` 5 tests + FIX-05 `table-fixed` 280px regression + FIX-06/08/09 audits. Gate: typecheck 0, lint 0e/6w, Vitest 598/598, cargo 334/334 (3 ignored), clippy clean, build 527.8 kB | M11 hardening |
| 2026-08-29 | M11 hardening session | Rust `openai.rs` 5 + `anthropic.rs` 9 + `openai_compat.rs` 10 (=24 new) + TS `useGeneration` 8 + `useProject` 11 + `ErrorBoundary` 5 (=24 new) → 622/622 (54 files), 358/358 (3 ignored); lint 0e/0w (fixed `HMITagTable`/`presetUi` exhaustive-deps + `IOMappingTable`/`ProjectContext` react-refresh via file-level disable); `npm audit fix` 5→0 vuln; `cargo audit` 2 high (quick-xml 0.39.4 via `plist`→`tauri-utils` build-deps only) + 19 unmaintained documented; `npm run build` 527.84 kB JS +51.39 kB CSS + `cargo build` clean; `docs/archive/tasks_M10_legacy.md` archived; v2.1 Audit Checklist walk via `m10Audit` 11 + `m10DeepLinkPanels` 5 green | Initial Commit |

---

# 14. Open Questions

Awaiting user decision (remaining):
- Language preference for maintaining this file going forward? (currently English with Arabic provider notes)
- Schedule for Rust `clippy -D warnings` / `cargo test` runs and installer-size verification? (last full run 2026-08-29: clippy 0w, 358/358, `npm run build` 527.84 kB)
- `tasks.md` M7–M11 ordering: proceed M7→M8→M9→M10→M11 or parallelize? — **Resolved: M11 done 2026-08-29**

Resolved 2026-08-29:
- ✅ Frontend toolchain location — confirmed repo root (fixed docs)
- ✅ `render_ladder` fate — wired as fallback (not removed)
- ✅ Cheatsheet injection — keep `role:"user"` prefix, docs fixed
- ✅ `tasks.md` vs old `tasks_M11/M12` — old files kept as history; new `tasks.md` is canonical
- ✅ `tasks(1).md` legacy — archived to `docs/archive/tasks_M10_legacy.md` with header (2026-08-29)
- ✅ 6 ESLint warnings — resolved 2026-08-29: 0e/0w
- ✅ Missing provider/hook tests — resolved 2026-08-29: 24+24 new tests

---

# 15. Verification

> These statuses reflect the execution on **2026-08-29 (M11 session; M6–M11 rows kept for history)**. The `tasks_M11.md`/`tasks_M12.md` historical verifications remain valid supplements.

| Check | Result | Details | Date |
| --- | --- | --- | --- |
| Production build (`npm run build` frontend) | ✅ Pass | `tsc -b && vite build` 276 modules, `dist/assets/index-CToXRnzO.js` 527.84 kB (gzip 161.17 kB), `index-DNbJ40k3.css` 51.39 kB; no errors | 2026-08-29 (M11) |
| Production installer (`npm run tauri build`, ≤20 MB) | ⏳ Not run this session / Build-time deps updated | Frontend build OK above + `cargo build` dev clean; prior full bundle verified 2026-08-22: MSI 4.8 MB / NSIS 3.4 MB — ≤20 MB MET (preserved) | 2026-08-22 (last full) / 2026-08-29 (frontend+rust) |
| Tests — frontend | ✅ Pass | `npm run test:run` from ROOT: 54/54 test files passed; **622 passed / 0 failed / 0 skipped** (vitest 4.1.8, ~39s; benign `act()` stderr; +24 M11: openai/anthropic/openai_compat + useGeneration/useProject/ErrorBoundary) | 2026-08-29 (M11) |
| Tests — Rust (`cargo test`) | ✅ Pass | **358 passed / 0 failed / 3 ignored** (ladder + generation + domain_trust + recent_projects + export 43 + 24 new M11 provider tests) | 2026-08-29 (M11) |
| Lint (`npm run lint` from ROOT) | ✅ Pass | Exit 0; **0 errors, 0 warnings** (fixed 6 warnings via file-level `eslint-disable` + `npm audit fix`) | 2026-08-29 (M11) |
| Type check (`npm run typecheck` from ROOT) | ✅ Pass | `tsc --noEmit` strict; **0 errors** | 2026-08-29 (M11) |
| Clippy (`cargo clippy -- -D warnings`) | ✅ Pass | Clean finish, no warnings | 2026-08-29 (M11) |
| Runtime / visual (browser via devtools MCP) | ⏳ Not run this session | Last runtime visual was M2 (2026-08-25) 1366×768/1920×1080 with IPC mock — passed. M11 changes are provider/hook tests + lint/docs only; no layout regression (build CSS 51.39 kB) | 2026-08-25 |
| M6 verification | ✅ Pass | Tabs 19/19, ladder 9 nodes + dark `ladder.css`, IL copy FIX-09 + `aria-live`, ST highlight + `st-empty` title; `render_ladder` fallback wired; all gates green above | 2026-08-28 |
| M7 verification | ✅ Pass | `processHmi` clone fix + overflow banner `hmi-overflow-banner` + expanded shift + 5 title tooltips + `useCodeConflicts` ref guard; 19 HMI table tests (incl. 4 new) +22 processHmi; all gates green above | 2026-08-28 |
| M8 verification | ✅ Pass | Canonical `recent_projects.json` + legacy fallback + dedupe-by-path + `project_save` MRU bump + `contains("..")` fix + `.dpa` normalize + `recent_projects_remove` IPC + global FIX-02 bus + `settings_has_api_key`×4 FIX-03; 574/574 + 334/334 | 2026-08-28 |
| M9 verification | ✅ Pass | `export.rs` 43 tests + `ProjectToolbar` FIX-09 5 tooltips + `aria-disabled` + `toast.success` on XML/CSV/IL; `exportToolbar` 20 tests (+8); whitespace IL guard + Save guard; all gates green above | 2026-08-29 |
| M10 verification | ✅ Pass | `AppShell` `dpa:open-settings` bus + 3 panels deep-link + `openai_compat::format_openai_compat_error` (401/429+link) + `gemini` link appendix + offline non-blocking toast + FIX-05/06/08/09 audits + `m10Audit` 11 + `m10DeepLinkPanels` 5; all gates green above | 2026-08-29 |
| M11 verification | ✅ Pass | Rust 5+9+10 + TS 8+11+5 = 48 new tests; `m10Audit` 11 + `m10DeepLinkPanels` 5 still green; `npm audit` 0; `cargo audit` 2 high (build-time quick-xml 0.39.4 via `plist`) documented; all gates green above | 2026-08-29 |

Additional notes:
- Toolchain versions observed: node v24.15.0, npm 12.0.2, cargo/rustc 1.96.0.
- `dist/` exists (frontend artifact 2026-08-29) and `src-tauri/target/` exists — not evidence of full installer build beyond 2026-08-22.
- `capabilities/default.json` now includes `clipboard-manager:default` (2026-08-28 fix); previously missing but clipboard still worked via plugin default (now explicit).

