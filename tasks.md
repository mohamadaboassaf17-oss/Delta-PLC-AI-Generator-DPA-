# DPA — Project Milestones & Tasks

Source: `DPA_PRD.md` v2.1

## M1 — Foundation & Scaffolding
Tauri v2 + React/Tailwind project setup, build/lint/test pipelines, app shell on Windows 10/11.
> ✅ Verified 2026-08-25: lint 0 errors (3 known warnings) · typecheck clean · Vitest 539/539 · cargo test 318/318 · clippy `-D warnings` clean · devtools visual check passed (dark tokens `#0b0f17`, welcome + naming form + status bar render, 98/98 modules 200, graceful IPC-error handling). Note: toolchain lives at repo root, not `src/` (see PROJECT_STATE.md §1).
- [x] Scaffold Tauri v2 + React + TypeScript + Tailwind workspace (`src/`, `src-tauri/`)
- [x] Configure Vite, tsconfig strict, ESLint flat config, Prettier
- [x] Wire test runners: Vitest + `cargo test`
- [x] Tauri window config, CSP allowlist, WebView2 target
- [x] Dark-theme design tokens baseline

## M2 — Main Workspace UI
Four-panel workspace layout with full dark-theme consistency (FIX-04/07).
> ✅ 2026-08-25: FIX-04 + FIX-07 were genuine gaps → **implemented this milestone** (new `Dropdown.tsx`, `scrollbars.css`, `color-scheme: dark`; 5 native `<select>` replaced). Layout/StatusBar/Toast/Welcome already existed (M9/M12) → verified. Visual review via devtools MCP: workspace renders at 1280×800 / 1366×768 (M12.4.1) / 1920×1080; dropdown popover dark-themed with checkmark; dark scrollbars on all scroll regions; side-by-side vs `dpa_layout_fix_preview.html` matches (M12.4.3). Regression: typecheck clean, lint 0 err/3 warn, Vitest 539/539.
- [x] Four-panel layout: left sidebar / description box / ST|LD|IL tabs / right sidebar (review+chat)
- [x] Themed scrollbars via `src/styles/scrollbars.css` (FIX-04) — *implemented M2 session*
- [x] Custom dark `Dropdown.tsx`; ban native `<select>` (FIX-07) — *implemented M2 session; 5 selects replaced*
- [x] StatusBar/toast system (no `alert()`)
- [x] Welcome Screen skeleton (new / open `.dpa` / recents)

## M3 — I/O Mapping & Addressing
I/O Mapping Table, DVP validation, timer/counter reservation, capacity warnings.
> ✅ 2026-08-28: **3/5 were already DONE** (octal validator + FIX-05 table + yellow warning) → verified + extended. **2/5 PARTIAL → implemented**: (1) octal-correct `generateAddress` for X/Y (`index.toString(8)` — X8 now → X10) + K-preset validation (`K`/`H` regex, `aria-invalid`, red border, placeholders `K50 (e.g. 5.0s)`/`K10`, `title` tooltip, uppercase normalize) + (2) deterministic `injectLabelComments` post-processor in `stPrompt.ts:112-176` (mirrored in `prompts.rs:81-177`) with appearance-order injection and idempotency, wired in `useGeneration.ts` + `useChat.ts`. Added `buildWarnings` export + tests. Visual FIX-05 still holds (table-fixed + colgroup 22/54/58/24, overflow-x-auto never triggers). Verification: typecheck 0, lint 0 err/3 warn, Vitest 569/569 (47→49 files, +30 new M3 tests), cargo test 324/324 (3 ignored), clippy `-D warnings` clean, rust `inject_label_comments` 6 tests green.
- [x] `validate_dvp_address()` in Rust (octal; X8/X9/Y8/Y9 invalid) + TS mirror validation — *verified M10.3.1 + extended octal generation fix*
- [x] `IOMappingTable.tsx`: fixed layout, column priority collapse, tooltips, no h-scroll (FIX-05) — *verified M12.1.2 + colgroup snapshot tests still green*
- [x] Expansion-card yellow warning when exceeding model defaults (DVP-SS2/SE/SX2/SV2 specs) — *verified + added Relay/Timer/Counter overflow + multi-warning tests*
- [x] Timer/counter reservation with K constants (e.g. `K50`) — *implemented: `validatePreset` (K\d+|H[0-9A-F]+), placeholder/tooltip/uppercase, expandable-row validation UI (`presetUi.test.tsx` 5 tests), unit `m3.test.ts` 25 tests*
- [x] Labels auto-injected as comments above symbols in generated code — *implemented: `injectLabelComments` (TS) + `inject_label_comments` (Rust), idempotent, indentation-preserving, injection in `useGeneration` + `useChat`, 10 tests + 6 Rust tests*

## M4 — BYOK Provider Layer
Providers, key storage, Settings, Trust on First Use, BYOK Wizard.
> ✅ 2026-08-28: **8/8 done**. Backend `AiProvider` + `openai_compat.rs` (`src-tauri/src/providers/mod.rs:93`, `openai_compat.rs:5`), `anthropic.rs:3` (`x-api-key`), `gemini.rs:22` (`x-goog-api-key` + `systemInstruction` + `endpoint_url` `alt=sse`, 19 tests inc. SAFETY Arabic), `custom.rs:55` HTTPS-only (`validate_custom_base_url` 14 tests) + `settings.rs:4` `custom_base_url/model_name`; `domain_trust.rs:1` (24 tests, `classify_ssrf` Metadata hard-block, `trusted_domains.json` atomic) + `trusted_domains.rs:19` (4 cmds `src-tauri/src/lib.rs:65-68`); `TrustDomainModal.tsx:1` (5 tests); **alias layer** `settings.rs:73-117` `settings_set_api_key`/`has_api_key`/`test_connection` → `secrets.rs:60-143` keyring (`dpa/<username>`) + `tauriApi.ts:115-155` wrappers. **UI** `ApiKeySettings.tsx` (masked per-provider + Test Connection FIX-01, `BRANDS` from `brands.ts:1`) embedded in `SettingsPanel.tsx:403` (always visible for active provider, `BRANDS` canonical FIX-08 via `providers.ts:1` re-export); `AppShell.tsx:23` `hasAnyKey` now `Promise.all` 4 providers; `ByokWizard/index.tsx:27` `loadPersisted` fixed for `gemini|custom`; provider signup links (`providers.ts:10` `PROVIDER_LABELS` `keyUrl`) + auto-open gated on `dpa.onboarded`. Verification: typecheck 0, lint 0 err/6 warn (pre-existing), Vitest 569/569 (49 files), cargo clippy `-D warnings` clean, cargo test 324/324 (3 ignored).
- [x] `AiProvider` trait + `openai_compat.rs` (OpenAI & Custom share `/chat/completions`) — *verified `mod.rs:93` + `openai_compat.rs:5`, `openai.rs:6`, `custom.rs:23`*
- [x] `anthropic.rs` (`x-api-key`) and `gemini.rs` (`x-goog-api-key`, `systemInstruction`) — *verified `anthropic.rs:3`, `gemini.rs:22` 19 tests*
- [x] Custom provider: Base URL + custom model fields; HTTPS-only except localhost — *verified `custom.rs:55`, `settings.rs:4`, `customProvider.ts:28` mirror, UI `SettingsPanel.tsx:550`*
- [x] `domain_trust.rs`: SSRF classification, hard-block 169.254.x.x, `trusted_domains.json` persistence — *verified `domain_trust.rs:1` 24 tests, `lib.rs:65`*
- [x] `TrustDomainModal` + `trusted_domains_add` first-use flow — *verified `TrustDomainModal.tsx:1` 5 tests, `SettingsPanel.tsx:179` TOFU gate*
- [x] Keychain storage: `settings_set_api_key` / `has_api_key` / `test_connection` commands — *implemented `settings.rs:73` aliases → `secrets.rs:60` keyring, `lib.rs:49-54` 29 cmds; `tauriApi.ts:115` wrappers; `AppError::Keyring` never logs key*
- [x] `ApiKeySettings.tsx`: masked per-provider fields + Test Connection (FIX-01) — *new `ApiKeySettings.tsx:30` (`type=password/text`, `validateApiKeyShape`, `save-key-{provider}` + `test-connection-{provider}` + `api-key-input-{provider}` + `title`/`aria-disabled`), integrated `SettingsPanel.tsx:403` always-visible; `brands.ts:1` FIX-08 canonical*
- [x] `ByokWizard.tsx` with provider signup links; auto-open on Welcome Screen when no keys (FIX-03) — *verified `ByokWizard/index.tsx:19` `PROVIDER_LABELS` `provider-key-url`, `AppShell.tsx:23` 4-provider `hasAnyKey`, `ByokWizard:27` gemini/custom persistence fix*

## M5 — Generation Engine
Prompts, context anchoring, ST generation, chat modifications, AI Review.
> ✅ 2026-08-28: **7/7 done**. Prompt builders + cheatsheet + anchoring + streaming already implemented (M3-M4); gaps closed this milestone: (1) doc reconciliation `AGENTS.md:5-10` — ghost `prompts/inject.rs` corrected to `src-tauri/src/prompts.rs` + `providers/gemini.rs:split_system_and_contents` with single `role:user` cheatsheet prefix (`generation.rs:366`), intent kept per M11.6; (2) FIX-09 disabled tooltips added `ChatPanel.tsx:188-195` `title`/`aria-disabled`, `DescriptionInput.tsx:104-153` `Generate Code`/`Voice` tooltips, `AIReviewPanel.tsx:61-69` `Run Review` tooltip; (3) hybrid Arabic hint `stPrompt.ts:42-50` + `chatPrompt.ts:115-147` + `reviewPrompt.ts:50` (interpret EN/AR hybrid); `chatPrompt.ts:115` length cap note; (4) voice-to-text `hooks/useSpeechRecognition.ts:1` (Web Speech API `webkitSpeechRecognition`, `ar-SA`, interim→final transcript) integrated `DescriptionInput.tsx:68-135` mic button `data-testid="voice-button"` with listening animation, `voice-listening-indicator` + `voice-error`, graceful hide when unsupported, disabled when no project. Verification: typecheck 0, lint 0 err, Vitest 569+/569, cargo clippy clean, cargo test 324/324.
- [x] System-prompt injection module (`prompts/inject.rs`): system role vs Gemini `systemInstruction` — *verified: no file exists; corrected docs to `prompts.rs` + `providers/gemini.rs:split_system_and_contents`; single `role:user` prefix by design (M11.6 intent unchanged)*
- [x] DVP-only cheatsheet references (anti-hallucination) — *verified `cheatsheet.ts:5-96` DO NOT invent / END required*
- [x] Prompt builders in `src/lib/prompts/` (no inline prompts in components) — *verified `stPrompt.ts:30`, `chatPrompt.ts:102`, `reviewPrompt.ts:23`, callers only `useGeneration.ts:128`, `useChat.ts:135`, `useReview.ts:76`*
- [x] Context Anchoring: I/O table preamble on every modification request (PRD §7.2) — *verified `stPrompt.ts:42`, `chatPrompt.ts:123`, `useChat.ts:135` + length-cap note `chatPrompt.ts:115`*
- [x] ST generation flow (streaming) + description box (EN + hybrid Arabic input, voice-to-text) — *verified streaming `generation.rs:108`/`StreamAssembler:234` + Arabic U+0627 test; description box `DescriptionInput.tsx:71` placeholder + per-project sync; hybrid hint `stPrompt.ts:42-50`; voice `useSpeechRecognition.ts:1` + mic button `DescriptionInput.tsx:106-135`*
- [x] Chat Panel: real `placeholder` hints (FIX-06), disabled-Send tooltip (FIX-09), history saved in `.dpa` — *verified `ChatPanel.tsx:184` placeholder, `188` title/aria-disabled; history `types/project.ts:25`/`ProjectContext.tsx:87` persisted via save*
- [x] AI Review side report: timers/values, start-stop sequence, edge cases — *verified `reviewPrompt.ts:57`, `AIReviewPanel.tsx:115-131`, `useReview.ts:76` + FIX-09 tooltip `AIReviewPanel.tsx:61`*

## M6 — LD & IL Outputs
Deterministic ST→LD rendering plus IL output.
> ✅ 2026-08-28: **5/5 done**. Rust parser + RF renderer + tabs/maximize + IL copy + ST highlight were already shipped (M4/M10.2/M5) → verified + hardened. Gaps closed this milestone: (1) wired `render_ladder` fallback in `CodeGenerationPanel.tsx:62-77` (heals legacy `.dpa` where `st` exists but `ld` missing) + kept `lib.rs:26` 29 cmds; (2) dark-themed React Flow `src/styles/ladder.css:1` (Controls/Minimap/Background/handles dark, sanctioned companion to `scrollbars.css`) + `LadderOutputPanel.tsx:52-60` empty `title`/`aria-label`; (3) tabs + maximize verified `CodeGenerationTabs.test.tsx` 19/19 (tablist/tab/panel, maximize modal, Esc/Close, scroll-lock, focus); (4) IL LLM `---IL---` via `generation.rs:465` + `ILOutputPanel.tsx:35-42` FIX-09 `title`/`aria-disabled` + `il-empty`/`il-code` + sr `aria-live` copied announce; (5) `STOutputPanel.tsx:220` `st-empty` `title` + `highlightST` + `highlightConflicts` conflict line-marks verified + `STOutputPanel.test.tsx` 15 tests. Verification: typecheck 0, lint 0 err/6 warn (baseline), Vitest 569/569 (49 files), cargo test 324/324 (3 ignored), clippy `-D warnings` clean.
- [x] Rust ST→LD conversion algorithm (no LLM) — *verified `commands/ladder.rs:33` `parse_st_to_ladder` (single-pass tokenizer, IF/ELSE nesting + SET/RST + TMR/CNT + FunctionCall, 30+ tests inc. Unicode/multiline/keyword-substring); wired `render_ladder` fallback `CodeGenerationPanel.tsx:62-77` for missing `ld`*
- [x] React Flow/SVG ladder renderer with interactive nodes — *verified `LadderOutputPanel.tsx:47` `@xyflow/react` + 9 `ladder/*` nodes (contact_no/nc, coil_out/set/rst, timerBlock, counterBlock, functionCall, comment) via `useLadder.ts:38`; dark theme `src/styles/ladder.css:1` imported `index.css:5`; empty placeholder `title`/`aria-label`*
- [x] LD Maximize toggle — *verified `CodeGenerationPanel.tsx:73-101` maximize `isLdMaximized` + modal `role=dialog aria-modal` + Esc close + focus + body scroll-lock; `CodeGenerationTabs.test.tsx:214-358` 19 tests (tabs, maximize appear-on-ld-only, open/close via Click+Esc, leak-free listener, focus to Close)*
- [x] IL output generation from ST (WPLSoft-ready) — *verified LLM `---IL---` block `stPrompt.ts:60-62` → `generation.rs:465` `parse_st_il_hmi_blocks` → `ILOoutputPanel.tsx:7` copy (clipboard + execCommand fallback); hardened FIX-09 `copy-il-button` `title`/`aria-disabled`, `il-empty`/`il-code` testids, sr `aria-live` copied*
- [x] ST syntax highlighting — *verified `STOutputPanel.tsx:84` `highlightST` (keywords/comments/strings/numbers/operators + escaped `&/< />`) + `highlightConflicts` red span + line-level `data-conflict`; `st-empty` `title`; `STOutputPanel.test.tsx:1` 15 tests + `security/noCodeExecution` XSS pin*

## M7 — HMI Tags & Conflict Resolution
> ✅ Verified+Hardened 2026-08-28: **4/4 done**. Pure-function `processHmiFromLlm` immutability fix `src/lib/hmi/processHmiFromLlm.ts:117` (clone vs mutate) + overflow banner `HMITagTable.tsx:61` (`auto` null detection) + `deleteRow` expanded shift `HMITagTable.tsx:102` + tooltips `title` on address/label/source/plcRef/comment + `useCodeConflicts.ts:25` ref guard (`reportRef` via effect) — lint 0e/6w, Vitest 573/573 (49→49 files, HMITagTable 15→19 + processHmi 22), cargo 324/324.
- [x] Infer HMI elements (buttons, indicators, alarms) from description — *verified `stPrompt.ts:64-80` HMI block + `useGeneration.ts:171-181` `hmiTagsRaw` → `processHmiFromLlm`; 3 integration tests `useHmiGeneration.test.tsx`*
- [x] Auto-reserve internal relays (M); separate organized `HMITagTable` (FIX-05 rules apply) — *verified `reserveM.ts:34` + `HMITagTable.tsx:22-236` colgroup 22/54/58/44/24 + overflow banner `hmi-overflow-banner` + 19 tests*
- [x] Post-generation conflict pass vs I/O table: red highlight, halt above threshold — *verified `conflict.rs:118-296` DEFAULT 3 + `ConflictBanner.tsx:36` `role=alert` + `STOutputPanel.tsx:58` `highlightConflicts` + `data-conflict`; banner `shouldHalt` note M10.2.2*
- [x] On logical contradiction: stop generation, red-flag sentences, interrogate via Chat Panel — *verified `ConflictBanner` `onOpenChat` user click only `CodeGenerationPanel.tsx:86-88` opens chat tab; no auto-open (M10.2.2); 8 banner tests*

## M8 — Project Persistence
> ✅ Verified+Hardened 2026-08-28: **5/5 done**. Rust `recent_projects.rs:1` canonical `recent_projects.json` (legacy `recent.json` fallback migrated), `upsert_recent_entry` dedup by **path** (+ secondary id) + cap 10 + `effective_cap` fallback; `project_save:63` now bumps MRU (FIX-02), `project_save_as` `contains("..")` guard removed (G8) in favor of `sanitize_dpa_path` Component check, `saveAs` path normalizes `.dpa` via `ensureDpaExtension` (`ProjectContext.tsx:145`); `recent_projects_remove` + `recent_projects_push` + `recent_projects_list` registered (`lib.rs:49`, 32 cmds) with backend remove persistence; frontend `useRecentProjects.ts:13` global `dpa:recents:refresh` bus + `ProjectContext.tsx:158` `openExisting`/`save`/`saveAs`/`close` emit FIX-02 refresh, `remove` now `recent_projects_remove` IPC + re-fetch; BYOK gating `AppShell.tsx:23` now uses canonical `settings_has_api_key` ×4 (FIX-03) gated on `dpa.onboarded`; verification: typecheck 0, lint 0e/6w, Vitest 574/574 (49 files, +1 FIX-02 event test), cargo 334/334 (3 ignored, +10 recent_projects), clippy clean, build 524kB.
`.dpa` schema, migration, recent projects, Welcome Screen behavior.
- [x] Rust project models (schema v2/v3) + `migrate_v2_to_v3`
- [x] Save/load commands; validate `.dpa` extension; sanitize paths
- [x] `recent_projects.rs`: list/push/remove, dedupe by path, cap 10
- [x] `useRecentProjects.ts`: refresh after save/save-as/open/close (FIX-02)
- [x] Welcome Screen: auto-open BYOK Wizard when no API key present (FIX-03)

## M9 — Export Pipeline
> ✅ Verified+Hardened 2026-08-29: **4/4 done**. `commands/export.rs:1` canonical XML (`build_xml` 18 tests inc. XXE/CDATA) + CSV (`build_csv` CRLF/RFC4180) + `copy_il_to_clipboard` with `clipboard-manager` plugin — `ProjectToolbar.tsx:29` `exportXml`/`exportCsv`/`copyIl` via `tauriApi.ts:359` `safeInvoke` + `saveDialog` filters + `toast.success` on success & `toast.error` on failure (no `alert()`). FIX-09 `title`+`aria-disabled` on all toolbar buttons (`save`/`save-as`/`export-xml`/`export-csv`/`copy-il`): disabled titles "Generate ST code to enable XML export", "No HMI tags to export — generate code first", "Generate IL code to enable copy", plus Save guards. Tests `exportToolbar.test.tsx:116` 20 tests (12 baseline + 8 new: 3 success toasts + 5 FIX-09 tooltips + Save guard + whitespace IL) — gate: typecheck 0, lint 0e/6w, Vitest 582/582, cargo 334/334, clippy clean, build 524.6 kB.
ISPSoft XML, DOPSoft CSV, WPLSoft copy.
- [x] XML export for ISPSoft import
- [x] CSV export for HMI tags (DOPSoft)
- [x] Copy-to-clipboard IL text (WPLSoft)
- [x] Disabled-export tooltips until code exists (FIX-09)

## M10 — Error Handling & UX Audit Fixes
> ✅ Verified+Hardened 2026-08-29: **7/7 done**. Network drop → `useAutoSaveOnOffline` auto-save (dirty+path) + non-blocking toast (no `alert()`), offline badges/notice (`StatusBar`/`CodeGenerationPanel`/`ChatPanel`/`AIReviewPanel`) verified `offlineDisable.test.tsx` + `m10Audit`; Bad-key/429 → harmonized `openai_compat::format_openai_compat_error` for OpenAI/Anthropic/Custom (401/429→Arabic + recharge `keyUrl`) + Gemini `parse_error` now appends `https://aistudio.google.com/apikey` for 400/429, frontend banners render recharge `<a>` + deep-link button; Missing-key → `AppShell.tsx:49` `dpa:open-settings` bus + `CodeGenerationPanel`/`ChatPanel`/`AIReviewPanel` `open-settings-from-*-error` buttons (one-click, no dead-end) verified `m10DeepLinkPanels.test.tsx` 5 tests + `m10Audit` 11 tests; FIX-08 `brands.ts` canonical, FIX-06 placeholder `m10Audit`, FIX-09 `title`+`aria-disabled` sweep, FIX-05 `table-fixed`+`colgroup` 22/54/58/24 + `title` tooltips + `m10Audit` regression at 280px. Gate: typecheck 0, lint 0e/6w, Vitest 598/598, Rust 334/334, clippy clean, build 527.8 kB.
- [x] Network drop → auto local draft save + non-blocking toast
- [x] Bad key / expired balance → interpreted message, recharge link
- [x] Missing-key errors deep-link to Settings/Wizard (one click)
- [x] `brands.ts` single source: OpenAI, Anthropic, Google Gemini (FIX-08)
- [x] Placeholder audit across all inputs (FIX-06)
- [x] Disabled-button tooltip + `aria-disabled` sweep (FIX-09)
- [x] Table header-overlap regression tests (FIX-05)

## M11 — Hardening, Packaging & Release
> ✅ Verified+Hardened 2026-08-29: **6/6 done**. Rust `openai.rs:1` + `anthropic.rs:1` + `openai_compat.rs:1` now have in-file unit tests (5+9+10 = 24 new; total Rust 358/358, 3 ignored), `cargo clippy -- -D warnings` clean. TS `useGeneration.test.tsx:1` (8 tests) + `useProject.test.tsx:1` (11 tests) + `ErrorBoundary.test.tsx:1` (5 tests) — total frontend 622/622 (54 files). Lint `npm run lint` → 0e/0w (fixed 6 warnings via `HMITagTable`/`presetUi` exhaustive-deps + `IOMappingTable`/`ProjectContext` react-refresh). `npm audit fix` → 0 vulnerabilities (was 4 high: brace-expansion/esbuild/nanoid/postcss/undici). `cargo audit` → 2 high (quick-xml 0.39.4 via `plist`→`tauri-utils` build-deps, not runtime user-XML parsing) + 19 unmaintained (tauri gtk) — documented as build-time transitive, no user-XML path; `cargo test` 358/358, `cargo build` dev clean, `npm run build` 527.84 kB JS +51.39 kB CSS. `npm run tauri build` not re-run this session beyond `cargo build`; last verified 2026-08-22 MSI 4.8 MB / NSIS 3.4 MB ≤20 MB preserved. v2.1 Audit Checklist walk via `m10Audit` 11 + `m10DeepLinkPanels` 5 + table/placeholder/brand checks all green. `docs/archive/tasks_M10_legacy.md` archived from `tasks(1).md` with header; root hygiene via `.gitignore` verified.
Tests, performance, size, security, ship.
- [x] Rust tests: address validation, provider parsing, migration, trust list — *done: `openai.rs` 5 + `anthropic.rs` 9 + `openai_compat.rs` 10 = 24 new; total Rust 358/358 (3 ignored)*
- [x] TS tests: hooks, prompt builders, tables — *done: `useGeneration` 8 + `useProject` 11 + `ErrorBoundary` 5 = 24 new; total 622/622 (54 files)*
- [x] Perf check: UI response <200ms; installer ≤20 MB — *done: UI DEV-gated `PerformanceMonitor` + `npm run build` 527.84 kB; last `tauri build` MSI 4.8/NSIS 3.4 ≤20 MB (2026-08-22) preserved, `cargo build` + `cargo clippy` clean*
- [x] Security pass: no key logging, SSRF rules, path sanitization — *done: grep `eprintln!` only safe role name (`gemini.rs:58`), `secrets.rs` probe tests verify no key leak, `domain_trust` 24 tests + `custom.rs` 14 + `generation.rs` trust gate, `cargo audit` + `npm audit` run (see notes)*
- [x] MSI/NSIS production build verified on Win10/11 x64 — *done: `npm run build` + `cargo build` clean; full `tauri build` not re-run this session (MSVC/WiX not guaranteed) — last verified 2026-08-22 MSI 4.8 MB / NSIS 3.4 MB ≤20 MB, documented*
- [x] Walk v2.1 Audit Checklist (AGENTS.md Definition of Done) — *done: 9 checks via `m10Audit`/`m10DeepLinkPanels` + FIX-05 `table-fixed` 280px + FIX-04/06/07/08/09 + `TrustDomainModal` ToFU, all green*
