# PROJECT_STATE.md

**Purpose:** Single Source of Truth for the current state of the *Delta PLC AI Generator (DPA)* project — written for AI agents and maintainers.
**Last updated:** 2026-08-23

---

# 1. Project Overview

Tauri v2 desktop app that generates Delta DVP Series PLC code (**ST + IL via LLM**; deterministic **ST→LD** ladder rendering in Rust, *not* via LLM) and HMI tag tables, using BYOK (bring-your-own-key) LLM APIs. Target platform: Windows 10/11 64-bit.

| Layer | Technology |
| --- | --- |
| Frontend | React 19.1 · TypeScript ~5.8.3 (strict) · Tailwind CSS 4.3 (Vite plugin) · Vite 7 |
| Frontend tests | Vitest 4.1.8 + Testing Library |
| Ladder UI | @xyflow/react 12.11 (React Flow) |
| Backend | Rust edition 2021 (rust-version 1.77) · tauri 2 · reqwest 0.12 (rustls-tls) · tokio 1 |
| Backend crates | serde/serde_json · thiserror · keyring 3 · uuid · chrono · tauri-plugin-{clipboard-manager,dialog,opener} |
| Identity / version | `com.delta.dpa` · app version 0.1.0 |
| Toolchain present | node v24.15.0 · npm 12.0.2 · cargo/rustc 1.96.0 |

> ⚠️ **CRITICAL LAYOUT FACT** — The frontend toolchain lives at the **repo root** (`package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `eslint.config.js`, `package-lock.json`) — **NOT under `src/`** as AGENTS.md and README incorrectly instruct ("cd src/ && npm …"). Running documented commands verbatim fails. `src/package-lock.json` is an 82-byte stub lockfile; `src/node_modules` contains only a stale Vite cache.

---

# 2. Current Status

### What works now
*(verified by static audit on 2026-08-23 plus frontend checks run that day; Rust-side checks were NOT executed this session — see Section 15)*

- Full project lifecycle: create/open/save/save-as `.dpa`, recent projects list, atomic saves, size guards, path sanitization
- SSE-streamed code generation (`generation-token`/`-done`/`-error` events) through all four providers: OpenAI, Anthropic, Gemini, Custom/OpenAI-compatible
- Deterministic ST→LD parsing + React Flow ladder rendering (9 node components)
- HMI tag table inference with M-reservation and conflict handling
- Context anchoring: immutable I/O-table preamble attached to every generation/modification request (PRD §7.2)
- AI review & safety: conflict scanning, model limits, ConflictBanner / AIReviewPanel / ModelLimitsBanner
- Export pipeline: ISPSoft XML, DOPSoft CSV, copy IL to clipboard
- Secrets in OS keyring (`secret_set/get/delete/test`)
- Trust on First Use domain gating with SSRF hard-blocks (169.254.x.x cloud metadata unconditionally blocked)
- Schema v3 persistence with automatic v2→v3 migration on load (Rust-authoritative)

### What has been implemented
Milestones M0–M9, M11, M12 have implemented-code evidence (see Section 3). M10 has code+tests but its checklist is unticked (discrepancy). 26 IPC commands registered; ~40 component files, 13 hooks, 47 Vitest test files, 310 Rust `#[test]` functions across 23 files.

### What is still missing
- Phase-2 multi-turn chat history folding — the codebase's ONLY TODO (`src/lib/prompts/chatPrompt.ts` line ~115)
- M10 checklist reconciliation (`tasks(1).md` shows 0/45 although matching M10 code/tests exist)
- Rust-side verification pending this cycle (clippy/test/build not run on 2026-08-23)
- Installer size ≤20 MB target NOT re-verified in the 2026-08-23 session (prior verification RECORDED in `tasks_M11.md`, 2026-08-22: MSI 4.8 MB / NSIS 3.4 MB — within target; re-verification requires production `npm run tauri build`)
- Version control: RESOLVED mid-session — a git repository was initialized at the project root on 2026-08-23 (~17:41); no nested repositories exist. Remaining gap: initial commit not yet made (see Sections 5 & 9)

### Current problems / limitations
Documentation has drifted from code. Key contradictions found 2026-08-23 (details in Sections 8–9):
1. AGENTS.md & README place the frontend under `src/` — it is at repo root.
2. AGENTS.md cites `prompts/inject.rs` — no such file exists (reality: `src-tauri/src/prompts.rs` sanitization + frontend prompt modules).
3. AGENTS.md claims cheatsheet injection via `role:"system"` (Gemini `systemInstruction`) — actual code (`commands/generation.rs` ~366–369) sends a single `role:"user"` message with the cheatsheet-prefixed prompt.
4. `lib.rs` stale comment says "Eighteen IPC commands" — actually 26 registered.
5. `tauri.conf.json` bundle `longDescription` mentions only ST+IL, omits LD (PRD/README advertise ST+LD+IL).
6. `tasks(1).md` (M10) shows 0/45 ticked despite existing M10 code/tests.
7. `render_ladder` command is registered, but its frontend wrapper `renderLadder()` (`src/lib/tauriApi.ts` ~185–187) is never called — UI consumes `ldGraph` from the `generation-done` payload instead.

### Approximate completion level
~90% of the planned milestone scope (M0–M12) shows implemented-code evidence, subject to the caveats listed above (unticked checklists, Rust checks not re-run this session, installer size not re-verified this session — prior verification recorded 2026-08-22).

---

# 3. Completed

> **Meaning of "Completed" here:** CODE EVIDENCE VERIFIED via static audit + the frontend checks executed on 2026-08-23. Rust tests were **not** executed this session; milestone dates are Unknown except where recorded — `tasks_M11.md` and `tasks_M12.md` contain dated completion events from 2026-08-22 (incl. production-build sizes and clippy/test results). Earlier milestones have no recorded dates.

| Item — what was done | When | Files / components | Notes |
| --- | --- | --- | --- |
| **M0 Scaffold** — Tauri v2 + React + Vite + TS strict scaffold | Completed | root toolchain, `src-tauri/` | Date: Unknown |
| **M1 Project file/settings/keyring/.dpa handling** — create/open/save/recent, OS-keyring secrets | Completed | `commands/project.rs`, `commands/settings.rs`, `commands/secrets.rs`, `paths.rs`, `limits.rs` | Date: Unknown; atomic `.dpa.tmp` rename saves |
| **M2 I/O mapping table + octal DVP validation** both sides | Completed | `src/components/IOMappingTable*`, `src/lib/validators/dvpAddress.ts`, Rust address validation | Date: Unknown; X8/X9/Y8/Y9 invalid (octal) |
| **M3 Generation engine** — SSE streaming to events `generation-token/-done/-error` | Completed | `commands/generation.rs`, providers, `useGeneration` hook | Date: Unknown |
| **M4 Ladder renderer** — React Flow, 9 node components | Completed | `src/components/ladder/*`, `parse_st_to_ladder` (Rust) | Date: Unknown; caveat: `render_ladder` IPC path unused (UI uses `ldGraph` payload) |
| **M5 HMI tag table** — inference, M-reservation, conflicts | Completed | `src/lib/hmi/*` | Date: Unknown |
| **M6 Context anchoring & chat modification** — immutable I/O preamble, `modify_code`, persisted chat_history | Completed | `stPrompt.ts`, `chatPrompt.ts`, `ProjectContext.tsx` | Date: Unknown; phase-2 multi-turn folding TODO remains |
| **M7 AI review & safety** — conflict scan, model limits, banners | Completed | `ConflictBanner`, `AIReviewPanel`, `ModelLimitsBanner`, conflict.rs | Date: Unknown |
| **M8 Export pipeline** — ISPSoft XML / DOPSoft CSV / clipboard IL | Completed | `export.rs` (43 tests), export commands | Date: Unknown |
| **M9 Polish** — StatusBar, Toast system, DEV-gated PerformanceMonitor | Completed | `StatusBar`, `Toast/*`, `PerformanceMonitor` behind `import.meta.env.DEV` | Date: Unknown |
| **M11 Gemini + Custom providers, ToFU, schema v3** | Completed | `providers/gemini.rs`, `providers/custom.rs`, `domain_trust.rs`, `models/project.rs` | Checklist 33/35 (unchecked: M11.9.2 Gemini manual real-key tests, M11.9.3 Custom manual real-key tests); dated completion events recorded 2026-08-22; schema bumped 2→3 "in M11.1" per code comment; migration exists ONLY in Rust (~line 112), auto-applied on load |
| **M12 Layout fixes** | Completed | layout-related components/styles | Checklist 8/10 (unchecked: M12.4.1 and M12.4.3 visual reviews at 1366×768 / 1920×1080); dated completion events recorded 2026-08-22 |
| **Schema v3 migration (Rust-only)** — `migrate_v2_to_v3`; newer rejected; save refuses non-current versions | During M11.1 (per code comment) | `models/project.rs`, `commands/project.rs` | Frontend mirrors v3 literal + `SCHEMA_VERSION=3` (`src/types/project.ts`, `src/lib/version.ts`) |
| **All four providers fully implemented** (no stubs) | Completed | `openai.rs`, `anthropic.rs`, `gemini.rs`, `custom.rs`, `openai_compat.rs`, `domain_trust.rs` | Gap: zero in-file unit tests in openai.rs / anthropic.rs / openai_compat.rs |
| **ToFU security** — trusted_domains.json persistence, SSRF hard-blocks | Completed | `domain_trust.rs` (25 tests), `TrustDomainModal` flow | HTTPS required except localhost/127.0.0.1 |
| **Keyring secret storage** | Completed | `secrets.rs` (19 tests), keyring 3 crate | API keys never logged |
| **Test suites existence** — 47 Vitest files (incl. 2 security suites); 310 Rust tests across 23 files | Verified present 2026-08-23 | `src/__tests__/`, `src-tauri/src/**` | Frontend execution results in Section 15 |

---

# 4. In Progress

- **M10 UX/security audit — status: In Progress (discrepancy).** Code and tests matching M10 exist, but `tasks(1).md` shows 0/45 ticked; needs reconciliation (retro-tick or re-audit).
- Nothing else is known to be actively in progress.

---

# 5. Next Steps

### Critical
- [x] Initialize a git repository — done 2026-08-23 (`.gitignore` files already prepared at root and in `src-tauri`)

### High
- [ ] Create the initial commit and confirm the tracked-file set excludes build artifacts (dist/, node_modules/, *.tsbuildinfo, screenshots)
- [ ] Run Rust-side verification from `src-tauri/`: `cargo clippy -- -D warnings`, `cargo test`
- [ ] Correct AGENTS.md / README inaccuracies: frontend location (root, not `src/`), nonexistent `prompts/inject.rs` reference, inaccurate `role:"system"` cheatsheet-injection claim, command count (26, not 18)
- [ ] Reconcile `tasks(1).md` M10 checklist with existing code/tests

### Medium
- [ ] Decide fate of the unused `render_ladder` IPC path (wire it up or remove it)
- [ ] Fix stale `lib.rs` doc comment ("Eighteen IPC commands" → 26)
- [ ] Update `tauri.conf.json` bundle `longDescription` to include LD
- [ ] Resolve 3 ESLint warnings (missing dep `createNew` in `HMITagTable.test.tsx:44`; `react-refresh/only-export-components` in `ProjectContext.tsx:139` and `:258`)
- [ ] Add unit tests for `openai.rs`, `anthropic.rs`, `openai_compat.rs`
- [ ] Add frontend tests for `useGeneration`, `useProject`, `ErrorBoundary`
- [ ] Verify installer ≤20 MB target via production build (`npm run tauri build`)

### Low
- [ ] Clean root hygiene artifacts before/at the initial commit (`dist/`, `node_modules/`, `*.tsbuildinfo` ×2, stray `vite.config.js` + `vite.config.d.ts`, 8 screenshot PNGs, `dpa_layout_fix_preview.html`, reserved-name file literally named `nul`)
- [ ] Implement phase-2 multi-turn chat history folding (`chatPrompt.ts` TODO)

---

# 6. Decisions

| Decision | Reason | Rejected alternatives | Impact |
| --- | --- | --- | --- |
| BYOK architecture (no backend service; keys stored in OS keyring) | Users keep control of their own API keys; no server cost/trust boundary | Hosted proxy service (not chosen) | All provider traffic originates client-side via Rust reqwest |
| Provider trait abstraction (`AiProvider`) with shared `openai_compat` for OpenAI+Custom | OpenAI and Custom share `/chat/completions` format; avoids duplication | Separate full implementations per provider | Anthropic/Gemini keep dedicated modules due to differing schemas |
| Trust-on-First-Use domain gating with SSRF hard-blocks | Custom endpoints can't be statically allowlisted; cloud metadata must never be reachable | Static CSP allowlist for custom domains | `trusted_domains.json` persistence; `classify_ssrf` blocks 169.254.x.x unconditionally, warns on private IPs |
| Static CSP without custom domains | LLM traffic flows through Rust reqwest over IPC, so webview CSP needn't open arbitrary hosts | Dynamic CSP injection | Confirmed accurate as of 2026-08-23 audit |
| Deterministic ST→LD conversion in Rust (not via LLM) | Ladder diagrams must be exact and reproducible; LLM output too unreliable | LLM-generated LD (not chosen) | Rust parser → `ldGraph` → React Flow rendering |
| Schema v3 with automatic migration on load (Rust-authoritative) | Forward compatibility without breaking old projects | Manual migration prompt; frontend-side migration | Newer versions rejected; save refuses non-current versions |
| Atomic file saves (`.dpa.tmp` rename) | Prevents corrupted project files on crash/disk-full | Direct overwrite | Applied in project save path |
| Context anchoring — immutable I/O table preamble on every request | Prevents model from reassigning reserved addresses (PRD §7.2) | Sending table only on first request | Implemented in `stPrompt.ts` / chat prompts |
| **Documentation-vs-implementation discrepancy (needs user decision):** current implementation sends the DVP cheatsheet inside a single `role:"user"` message (`commands/generation.rs` ~366–369); AGENTS.md's description of `role:"system"` injection is inaccurate | Factual record only — no change decided yet | N/A | Either fix docs or change behavior; awaiting user decision |

---

# 7. Changes

This is the **initial baseline entry**: file created 2026-08-23; no prior state file existed.

Notable structural facts recorded at baseline:
- Frontend toolchain lives at the repo **root**, diverging from historical docs (AGENTS.md/README point at `src/`).
- Project schema was bumped 2→3 during M11.1 (per code comment in `models/project.rs`).
- Task checklists partially unticked relative to code reality: `tasks(1).md` M10 = 0/45 (code exists), `tasks_M11.md` = 33/35 (unchecked: M11.9.2/M11.9.3), `tasks_M12.md` = 8/10 (unchecked: M12.4.1/M12.4.3).

---

# 8. Problems & Solutions

No historical problem/solution log existed before this file was created.

Discrepancies FOUND today, recorded here as problems (root cause in every case: documentation drifted from code while code evolved ahead). All are **UNRESOLVED** — see Section 9 for severity/status; details are in Section 2 ("Current problems / limitations") and are cross-referenced rather than duplicated:

1. Frontend location documented incorrectly (AGENTS.md, README) — UNRESOLVED
2. Nonexistent `prompts/inject.rs` referenced (AGENTS.md) — UNRESOLVED
3. Cheatsheet injection described as `role:"system"` but implemented as single `role:"user"` message — UNRESOLVED
4. Stale command count in `lib.rs` comment (18 vs actual 26) — UNRESOLVED
5. Bundle long description omits LD — UNRESOLVED
6. M10 checklist stale (0/45 vs existing code) — UNRESOLVED
7. Registered-but-unused `render_ladder` IPC path — UNRESOLVED

---

# 9. Known Issues

| Issue | Severity | Status |
| --- | --- | --- |
| No version control (`.git` absent anywhere) | High | Resolved (2026-08-23) |
| Doc/code mismatches in AGENTS.md + README (frontend path, `prompts/inject.rs`, system-role claim, command count) | Medium | Open |
| Zero Rust unit tests in `openai.rs` / `anthropic.rs` / `openai_compat.rs` | Medium | Open |
| No frontend tests for `useGeneration` / `useProject` / `ErrorBoundary` | Medium | Open |
| Rust clippy/test/build checks not re-run since 2026-08-22 (recorded clean then, 290 tests; current source has 310 #[test] fns) | Medium | Open |
| M10 checklist shows 0/45 despite existing code/tests | Low-Medium | Open |
| `render_ladder` command registered but frontend wrapper never called | Low | Open |
| 3 ESLint warnings (see Section 5) | Low | Open |
| Root hygiene artifacts incl. Windows reserved-name file `nul`, stray compiled Vite config copies, screenshots | Low | Open |
| Installer size ≤20 MB not re-verified this session (prior verification recorded 2026-08-22: MSI 4.8 MB / NSIS 3.4 MB) | Low | Open |
| Initial commit not yet made / tracked-file set unverified | Low | Open |

---

# 10. Important Files

| Path | Purpose |
| --- | --- |
| `package.json` (ROOT) | Frontend scripts/deps — run npm from ROOT |
| `vite.config.ts` / `vitest.config.ts` / `tsconfig.json` | Build / test / typecheck configuration (ROOT) |
| `AGENTS.md` · `README.md` · `DPA_PRD.md` | Agent instructions · user guide · Arabic PRD v2.0 (§1–§10; milestones live only in task files) |
| `tasks.md` · `tasks(1).md` · `tasks_M11.md` · `tasks_M12.md` | Milestone checklists M0–M9 (79/80), M10 (0/45), M11 (33/35), M12 (8/10) |
| `index.html` · `src/App.tsx` | Entry HTML · default-export page component (ErrorBoundary > ToastProvider > ProjectProvider > AppShell) |
| `src/context/ProjectContext.tsx` | Global state (Context + useReducer) |
| `src/lib/tauriApi.ts` | Typed IPC layer (~353 lines) |
| `src/lib/prompts/{cheatsheet,stPrompt,chatPrompt,reviewPrompt,sanitize,index}.ts` | Prompt construction, marker contract, sanitization |
| `src/lib/validators/dvpAddress.ts` | Frontend octal DVP address validation (Rust authoritative) |
| `src/types/project.ts` | Frontend project types (version 3 literal) |
| `src/components/AppShell/AppShell.tsx` | Single-window shell |
| `src-tauri/Cargo.toml` · `tauri.conf.json` · `capabilities/default.json` | Backend manifest · window/bundle/CSP config · limited permissions (core/opener/dialog defaults) |
| `src-tauri/src/lib.rs` | Registers ALL 26 commands (invoke_handler lines 42–69) |
| `src-tauri/src/error.rs` · `paths.rs` · `limits.rs` · `prompts.rs` | Error enum · DPA path sanitize/ext guard · size guard · marker sanitization mirror |
| `src-tauri/src/commands/*.rs` | One module per feature: project, settings, secrets, dvp, generation, conflicts, export, ladder, trust |
| `src-tauri/src/models/project.rs` | Schema v3 constants + `migrate_v2_to_v3` (~line 112) |
| `src-tauri/src/providers/*.rs` | `AiProvider` implementations + `openai_compat.rs`; `domain_trust.rs` separate (ToFU/SSRF) |

---

# 11. Architecture Notes

**Data flow:** UI (React) → typed IPC wrappers (`src/lib/tauriApi.ts`) → `#[tauri::command]` handlers → SSE streaming via reqwest → Tauri events `generation-token` / `-done` / `-error` → panels render ST / IL / LD (`ldGraph`) / HMI.

- **Context anchoring (PRD §7.2):** the full I/O table is attached as an immutable preamble to every generation/modification request, preventing address reassignment drift.
- **Prompt assembly (TS):** marker contract `---ST---` / `---IL---` / `---HMI---`; defense-in-depth sanitization mirrored on both sides (`sanitize.ts` frontend + `src-tauri/src/prompts.rs` backend). Current implementation prefixes the DVP cheatsheet into a single `role:"user"` message (see Section 6 discrepancy).
- **Ladder pipeline:** `parse_st_to_ladder` deterministic Rust parser → `ldGraph` payload in `generation-done` → React Flow rendering with 9 node types. The standalone `render_ladder` command is registered but currently unused by the UI.
- **Persistence:** `.dpa` JSON, schema v3; migration applied automatically on load (Rust-only logic; newer versions rejected; save refuses non-current versions); atomic `.dpa.tmp` rename; size limits enforced.
- **Secrets:** OS keyring accessed exclusively via `secret_*` commands; keys never logged.
- **Custom provider security chain:** HTTPS-or-localhost validation (`validate_custom_base_url`) → ToFU gate against `trusted_domains.json` → `classify_ssrf` (hard block 169.254.x.x; warn on private IPs).
- **State:** React Context + `useReducer` (`ProjectContext.tsx`); local state for UI-only concerns.
- **CSP/capabilities:** static CSP without custom domains (traffic via Rust reqwest over IPC); capabilities limited to `core:default` / `opener:default` / `dialog:default`.
- **Window/layout:** single window 1280×800, dev port 1420 strict; bundle targets `["msi","nsis"]`; AppShell hosts panels.

---

# 12. Development Rules

Rules any future AI agent must follow:

- ALWAYS run npm commands from the repo **ROOT** — not `src/` (docs are wrong about this; see Section 1 warning).
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
| 2026-08-23 | Bootstrap session | Full read-only audit + light verification performed; PROJECT_STATE.md created. Findings: doc/code contradictions listed in Section 2; frontend tests 539/539 passing; typecheck/lint passing; Rust side unexecuted this session. Post-write accuracy review performed and corrections applied, including discovery that a git repository was initialized at the project root mid-session (~17:41) | Initial commit + tracked-file hygiene check + Rust-side verification |

---

# 14. Open Questions

Awaiting user decision:
- Confirm canonical frontend toolchain location (repo root) and authorize correcting AGENTS.md/README accordingly?
- Remove vs wire up the registered-but-unused `render_ladder` IPC path?
- Cheatsheet injection: move to `role:"system"` (behavior change) vs fix the docs? (Current behavior is a single `role:"user"` message.)
- Language preference for maintaining this file going forward?
- Schedule for Rust `clippy -D warnings` / `cargo test` runs and installer-size verification?
- How to reconcile the M10 checklist: retro-tick verified items vs perform a fresh audit?

---

# 15. Verification

> These statuses reflect ONLY what was actually executed on **2026-08-23**. Anything not executed is marked Not run / Unknown.

| Check | Result | Details | Date |
| --- | --- | --- | --- |
| Production build (`npm run tauri build`, installer ≤20 MB claim) | ⏳ Not run this session / Unknown | Not attempted this session. Prior verification RECORDED in `tasks_M11.md` (2026-08-22): MSI 4.8 MB / NSIS 3.4 MB — ≤20 MB target MET at that time | 2026-08-23 |
| Tests — frontend | ✅ Pass | `npm run test -- --run` from ROOT: 47/47 test files passed; **539 passed / 0 failed / 0 skipped** (vitest 4.1.8, duration 35.43s; benign `act()` stderr warnings) | 2026-08-23 |
| Tests — Rust (`cargo test`) | ⏳ Not run this session / Unknown | 310 `#[test]` fns exist across 23 files (existence verified statically) but were NOT executed this session. Prior verification RECORDED in `tasks_M12.md` (2026-08-22): clippy/test clean at 290 Rust tests at that time | 2026-08-23 |
| Lint (`npm run lint` from ROOT) | ✅ Pass | Exit 0; **0 errors, 3 warnings**: missing dep `createNew` in `src/__tests__/HMITagTable.test.tsx:44`; `react-refresh/only-export-components` in `src/context/ProjectContext.tsx:139` and `:258` | 2026-08-23 |
| Type check (`npm run typecheck` from ROOT) | ✅ Pass | tsc strict mode; exit 0; **0 errors** | 2026-08-23 |
| Runtime / manual desktop-app testing | ❌ Not performed | No manual session executed on 2026-08-23 | 2026-08-23 |

Additional notes:
- Toolchain versions observed: node v24.15.0, npm 12.0.2, cargo/rustc 1.96.0.
- `dist/` exists (prior production frontend artifact) and `src-tauri/target/` exists (local builds were run previously; production build verified 2026-08-22 per `tasks_M11.md`) — not evidence of a passing current build beyond that date.
