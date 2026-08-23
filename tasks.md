# Tasks — Delta PLC AI Generator (DPA)

## M0 — Project Scaffold

- [x] Bootstrap Tauri v2 project with `create-tauri-app` (React + TypeScript + Vite template)
- [x] Set up Tailwind CSS v4 with `@theme` inline pattern
- [x] Configure ESLint flat config, Prettier, `tsc --noEmit` in `src/package.json`
- [x] Configure `rustfmt`, `clippy -- -D warnings` in `src-tauri/`
- [x] Add Vitest test harness in `src/` with one passing smoke test
- [x] Add Cargo test harness in `src-tauri/` with one passing smoke test
- [x] Verify `npm run tauri dev` launches empty window on Windows 10/11
- [x] Set up path aliases (`@/` → `src/`) in tsconfig + Vite

## M1 — Project File & Settings

- [x] Define `.dpa` file schema as versioned JSON (`version: 2`, project metadata, I/O table, HMI table, chat history)
- [x] Implement Tauri `#[command]` for new/open/save/save-as project with native file dialogs
- [x] Store and render recent projects list (last 10) — read/write via Tauri app data dir
- [x] Build Settings page UI: API key input (masked), provider dropdown (Anthropic/OpenAI), model dropdown
- [x] Store API key in OS keychain via `keyring` crate or `tauri-plugin-keychain`
- [x] Build BYOK setup wizard with step-by-step provider-specific instructions, direct links, and imagery
- [x] Implement Test Connection button — sends minimal API call to validate key before saving
- [x] Add empty-state: auto-open BYOK wizard when no API key is found on launch
- [x] Write Rust unit tests for `.dpa` serialize/deserialize round-trip

## M2 — I/O Mapping Table

- [x] Define `IOPoint` TypeScript interface (address, type, label, defaultValue)
- [x] Build `IOMappingTable` React component: editable grid with add/remove row, inline edit
- [x] Populate DVP model registry (`DVP-SS2`, `DVP-SE`, `DVP-SX2`, `DVP-SV2`) with per-model I/O limits
- [x] Build model selector dropdown; filter available address ranges based on selected model
- [x] Add yellow warning banner when I/O count exceeds model defaults ("expansion card required")
- [x] Wire I/O table to `.dpa` save/load via Tauri commands
- [x] Write Vitest component tests for add/remove/edit row logic
- [x] Write Vitest tests for model constraint warnings

## M3 — AI Code Generation Engine

- [x] Create `src/lib/prompts/` directory with DVP instruction set cheatsheet module
- [x] Write ST generation prompt template — includes DVP-only syntax constraints, supported logic gates, SET/RST, timers, counters
- [x] Write IL generation prompt template
- [x] Implement Tauri command `generate_code` wrapping Anthropic + OpenAI SDK calls with configurable provider/model
- [x] Implement streaming response parsing on Tauri side; emit events to frontend
- [x] Build description input box component with placeholder text and generate button
- [x] Build ST output panel with syntax highlighting (CodeMirror or shiki)
- [x] Build IL output panel (read-only, copyable)
- [x] Wire generate flow: description + I/O table → Tauri command → streaming tokens → rendered output
- [x] Handle API errors gracefully: invalid key, expired credits, network timeout — display non-blocking error banner
- [x] Write Rust unit tests for prompt construction (verify I/O table is embedded)
- [x] Write Vitest tests for description input validation and error states

## M4 — Ladder Diagram Renderer

- [x] Design LD node types in Rust: Contact (NO/NC), Coil, Timer, Counter, RungStart
- [x] Implement deterministic IL-to-graph parsing algorithm in Rust
- [x] Define LD JSON output format (array of rungs, each with serial + parallel branches)
- [x] Create Tauri command `render_ladder` → accepts ST/IL, returns LD JSON graph
- [x] Set up React Flow in frontend with custom node types matching PLC symbols
- [x] Build split-pane layout: ST panel (left) / LD React Flow canvas (right)
- [x] Implement LD canvas interactions: zoom, pan, node selection
- [x] Auto-sync: regenerating ST triggers LD re-render
- [x] Write Rust unit tests for IL parser (sample rungs → expected graph nodes)
- [x] Write Vitest tests for React Flow node rendering

## M5 — HMI Tag Table

- [x] Extend prompt templates with HMI element inference (buttons, indicator lamps, alarms from description)
- [x] Define `HMITag` interface (address, type, label, PLC reference)
- [x] Implement auto-reservation of internal relays (M) for HMI use — prevent overlap with I/O table
- [x] Build `HMITagTable` component: read-only inferred tags, manual override allowed
- [x] Implement address conflict checker: cross-reference HMI tags against I/O table, flag overlaps
- [x] Wire HMI tags to `.dpa` save/load
- [x] Write Vitest tests for M auto-reservation and conflict detection logic

## M6 — Context Anchoring & Chat Panel

- [x] Build Chat Panel sidebar component: message history, input box, send button
- [x] Implement context anchoring: on every chat message, construct preamble embedding full I/O table + HMI table + current ST code as immutable block
- [x] Create `modify_code` Tauri command — sends anchored context + user message → returns updated ST
- [x] Diff-and-apply: show changed sections highlighted before accepting
- [x] Save full conversation history to `.dpa` project file
- [x] Restore chat history on project open
- [x] Write Vitest tests for context preamble construction and history persistence

## M7 — AI Review & Safety

- [x] Write AI review prompt template: "explain what this code does, list timers/counters with values, note edge cases"
- [x] Build AI Review panel component — rendered plain-text with bullet points, displayed beside generated code
- [x] Implement model-specific I/O limit warnings: check addresses against selected DVP model's max ranges, show yellow banner on exceed
- [x] Implement conflict detection pass: parse generated address references, cross-reference against I/O table, highlight mismatches in red
- [x] Implement halt-on-conflict: block rendering and open chat panel if address conflicts exceed threshold
- [x] Write Rust unit tests for address conflict scanner
- [x] Write Vitest tests for warning/error rendering states

## M8 — Export Pipeline

- [x] Implement XML generation for ISPSoft import format in Rust
- [x] Implement CSV generation for DOPSoft Tag import format in Rust
- [x] Add export toolbar buttons (XML, CSV, Copy IL) in the workspace header
- [x] Implement "Copy IL to Clipboard" via Tauri clipboard API
- [x] Write Rust unit tests for XML and CSV output against expected schemas

## M9 — Polish & Ship

- [x] Build Welcome Screen with: New Project, Open `.dpa` File, Recent Projects list
- [x] Add auto-save draft on internet disconnect (non-blocking toast notification)
- [x] Graceful degradation: disable Generate/Chat when offline, keep all local features working
- [x] Final layout: left sidebar (I/O + HMI), center top (description + generate), center bottom (ST | LD split), right sidebar (AI review + chat)
- [x] Configure Tauri bundle for Windows MSI/NSIS installer, target ≤ 20 MB
- [ ] Test on clean Windows 10 and Windows 11 64-bit (fresh install, no dev tools)
- [x] Verify all lint, typecheck, and test suites pass (`npm run lint && npm run typecheck && npm run test -- --run && cargo clippy -- -D warnings && cargo test`)
