//! Ladder Diagram (LD) rendering command and deterministic ST→LD parser.
//!
//! The parser is a single-pass tokenizer over ST source text. It is
//! deliberately small and conservative: anything outside the v1 spec is
//! silently skipped, never errored, so LLM output that contains
//! unrelated lines (comments, blank lines, prose) cannot break it.

use crate::models::ladder::{LadderGraph, LdEdge, LdNode, LdNodeKind};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Maximum size of an ST source string accepted by [`render_ladder`].
const MAX_ST_BYTES: usize = 1_048_576; // 1 MiB

/// Maximum size of a single statement (after `;` joining) in bytes.
const MAX_STATEMENT_BYTES: usize = 65_536; // 64 KiB safety bound

/// Deterministic Structured Text → Ladder Diagram parser.
///
/// v1 scope (per PRD §7.2 / M4 spec):
/// - `IF <cond> THEN <body> [ELSE <else-body>] END_IF;` (nesting AND-combines conditions)
/// - `<lhs> := <rhs>;` where `<rhs>` is a constant, single identifier, or `AND`-chain
/// - `SET <addr>;` and `RST <addr>;`
/// - IL-style `TMR[T][A] <target> <preset>` and `CNT|DCNT <target> <preset>` (semicolon optional)
/// - `<NAME>(<arg>, ...);` function calls (rendered as a single block)
///
/// Everything else (comments, blank lines, unknown instructions) is silently
/// skipped. The returned graph uses stable node IDs of the form
/// `r{rung}_b{branch}_n{order}` and edge IDs of the form
/// `e{source_id}_to_{target_id}`.
pub fn parse_st_to_ladder(st: &str) -> LadderGraph {
    let mut state = ParserState::default();
    for stmt in split_statements(&strip_block_comments(st)) {
        process_top_level(&mut state, &stmt);
    }
    state.finish()
}

/// Re-render a Ladder Diagram from a ST source string.
///
/// `render_ladder` is registered as a Tauri command but is **not** the
/// happy-path source of LD on the M4 frontend (the LD is pre-computed
/// in the `generation-done` event). It exists for future M6 chat
/// modifications and manual re-render scenarios.
#[tauri::command]
pub fn render_ladder(st: String) -> Result<LadderGraph, String> {
    if st.len() > MAX_ST_BYTES {
        return Err("ST input exceeds 1 MB limit".to_string());
    }
    Ok(parse_st_to_ladder(&st))
}

// ---------------------------------------------------------------------------
// Parser state
// ---------------------------------------------------------------------------

#[derive(Default)]
struct ParserState {
    nodes: Vec<LdNode>,
    /// Counter for the next rung to emit. Incremented by `emit_rung`.
    next_rung: u32,
}

impl ParserState {
    /// Append a single node at the given `(rung, branch, order)`.
    fn push_node(&mut self, rung: u32, branch: u32, order: u32, kind: LdNodeKind, label: String) {
        self.nodes.push(LdNode {
            id: format!("r{rung}_b{branch}_n{order}"),
            kind,
            label,
            rung,
            branch,
            order,
        });
    }

    /// Emit a complete rung: zero or more prefix contacts (in order) on
    /// branch 0, followed by a single terminal action node.
    fn emit_rung(&mut self, prefix_contacts: &[(bool, String)], action: (LdNodeKind, String)) {
        let rung = self.next_rung;
        self.next_rung = self.next_rung.saturating_add(1);
        let mut order: u32 = 0;
        for (negated, addr) in prefix_contacts {
            let (kind, label) = if *negated {
                (
                    LdNodeKind::ContactNc {
                        address: addr.clone(),
                    },
                    format!("/{addr}"),
                )
            } else {
                (
                    LdNodeKind::ContactNo {
                        address: addr.clone(),
                    },
                    addr.clone(),
                )
            };
            self.push_node(rung, 0, order, kind, label);
            order = order.saturating_add(1);
        }
        let (kind, label) = action;
        self.push_node(rung, 0, order, kind, label);
    }

    /// Compute serial edges and return the finished graph.
    fn finish(self) -> LadderGraph {
        let edges = build_serial_edges(&self.nodes);
        LadderGraph {
            nodes: self.nodes,
            edges,
        }
    }
}

// ---------------------------------------------------------------------------
// Statement-level dispatch
// ---------------------------------------------------------------------------

/// Process one top-level statement. Each top-level statement produces
/// exactly one rung (or, for `IF...ELSE...END_IF`, two rungs).
fn process_top_level(state: &mut ParserState, stmt: &str) {
    let trimmed = stmt.trim();
    if trimmed.is_empty() {
        return;
    }
    // ASCII-only uppercasing keeps byte offsets identical to `trimmed`,
    // so keyword positions found in `upper` are safe when slicing the
    // original. Full Unicode `to_uppercase()` can change byte lengths
    // (`ß` -> "SS", `ﬂ` -> "FL"), shifting offsets and risking a
    // mid-character slice panic.
    let upper = trimmed.to_ascii_uppercase();

    if first_token_is(&upper, "IF") {
        process_if_block(state, trimmed, &upper);
        return;
    }

    if let Some((lhs, rhs)) = parse_assignment(trimmed) {
        emit_assignment_rung(state, &lhs, &rhs, &[]);
        return;
    }

    if let Some(action) = parse_set_rst(trimmed, &upper) {
        state.emit_rung(&[], action);
        return;
    }

    if let Some(action) = parse_il_instruction(trimmed, &upper) {
        state.emit_rung(&[], action);
        return;
    }

    if let Some(action) = parse_function_call(trimmed) {
        state.emit_rung(&[], action);
    }

    // Unrecognized — skip silently per v1 spec.
}

/// Process an `IF <cond> THEN <body> [ELSE <else-body>] END_IF` block.
/// The body of an IF (per v1 examples) is a single statement, which may
/// itself be a nested IF (AND-combining the conditions).
fn process_if_block(state: &mut ParserState, trimmed: &str, upper: &str) {
    let then_pos = match find_keyword_ci(upper, "THEN") {
        Some(p) => p,
        None => return,
    };
    // `then_pos` is the byte offset of `THEN`; the condition runs from
    // immediately after `IF` (2 bytes) to that offset.
    let condition = trimmed[2..then_pos].trim();
    if condition.is_empty() {
        return;
    }

    let after_then = then_pos + "THEN".len();
    // Find the next ELSE or END_IF at the same nesting depth as the
    // opening IF. This correctly handles nested IFs inside the body.
    let next = match find_next_at_depth(upper, after_then) {
        Some(n) => n,
        None => return,
    };
    let (end_pos, kw) = next;
    let body_section = trimmed[after_then..end_pos].trim();

    match kw {
        BranchKw::EndIf => {
            // THEN-only body
            let mut then_prefix: Vec<(bool, String)> = vec![(false, condition.to_string())];
            process_body(state, body_section, &mut then_prefix);
        }
        BranchKw::Else => {
            // THEN and ELSE bodies
            let then_body = body_section.trim().to_string();
            let after_else = end_pos + "ELSE".len();
            // Find the END_IF that closes this block (depth-aware).
            if let Some((else_end_pos, BranchKw::EndIf)) = find_next_at_depth(upper, after_else) {
                let else_body = trimmed[after_else..else_end_pos].trim().to_string();
                let mut then_prefix: Vec<(bool, String)> = vec![(false, condition.to_string())];
                process_body(state, &then_body, &mut then_prefix);
                let mut else_prefix: Vec<(bool, String)> = vec![(true, condition.to_string())];
                process_body(state, &else_body, &mut else_prefix);
            }
            // If ELSE without matching END_IF, silently skip.
        }
    }
}

/// Process a single-statement body (the THEN or ELSE clause of an IF).
/// `prefix` is the current condition stack; nodes are emitted with the
/// stack as their prefix contacts.
fn process_body(state: &mut ParserState, body: &str, prefix: &mut Vec<(bool, String)>) {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return;
    }
    // See the note in `process_top_level`: ASCII-only uppercasing keeps
    // byte offsets aligned with `trimmed` for safe slicing.
    let upper = trimmed.to_ascii_uppercase();

    if first_token_is(&upper, "IF") {
        // Nested IF: AND with outer conditions, recurse.
        let then_pos = match find_keyword_ci(&upper, "THEN") {
            Some(p) => p,
            None => return,
        };
        let inner_condition = trimmed[2..then_pos].trim();
        if inner_condition.is_empty() {
            return;
        }
        let after_then = then_pos + "THEN".len();
        let next = match find_next_at_depth(&upper, after_then) {
            Some(n) => n,
            None => return,
        };
        let (end_pos, kw) = next;
        let inner_body_section = trimmed[after_then..end_pos].trim();

        match kw {
            BranchKw::EndIf => {
                prefix.push((false, inner_condition.to_string()));
                process_body(state, inner_body_section, prefix);
                prefix.pop();
            }
            BranchKw::Else => {
                let inner_then = inner_body_section.trim().to_string();
                let after_else = end_pos + "ELSE".len();
                if let Some((else_end_pos, BranchKw::EndIf)) =
                    find_next_at_depth(&upper, after_else)
                {
                    let inner_else = trimmed[after_else..else_end_pos].trim().to_string();
                    prefix.push((false, inner_condition.to_string()));
                    process_body(state, &inner_then, prefix);
                    if let Some(last) = prefix.last_mut() {
                        last.0 = true;
                    }
                    process_body(state, &inner_else, prefix);
                    prefix.pop();
                }
            }
        }
        return;
    }

    if let Some((lhs, rhs)) = parse_assignment(trimmed) {
        emit_assignment_rung(state, &lhs, &rhs, prefix);
        return;
    }

    if let Some(action) = parse_set_rst(trimmed, &upper) {
        state.emit_rung(prefix, action);
        return;
    }

    if let Some(action) = parse_il_instruction(trimmed, &upper) {
        state.emit_rung(prefix, action);
        return;
    }

    if let Some(action) = parse_function_call(trimmed) {
        state.emit_rung(prefix, action);
    }

    // Unrecognized body — skip silently.
}

// ---------------------------------------------------------------------------
// Statement-level pattern parsers
// ---------------------------------------------------------------------------

/// `<lhs> := <rhs>;` — emits a coil (LHS) and zero or more `ContactNo`s
/// derived from the RHS.
fn emit_assignment_rung(state: &mut ParserState, lhs: &str, rhs: &str, prefix: &[(bool, String)]) {
    let addr = lhs.trim();
    if !is_dvp_address(addr) {
        return;
    }
    let mut rung_prefix: Vec<(bool, String)> = prefix.to_vec();
    for contact in rhs_to_contacts(rhs) {
        rung_prefix.push((false, contact));
    }
    state.emit_rung(
        &rung_prefix,
        (
            LdNodeKind::CoilOut {
                address: addr.to_string(),
            },
            addr.to_string(),
        ),
    );
}

/// `<lhs> := <rhs>;` (no leading whitespace, no `;` at the end).
fn parse_assignment(stmt: &str) -> Option<(String, String)> {
    let s = stmt.trim().trim_end_matches(';').trim();
    let bytes = s.as_bytes();
    // Find the first `:=` whose left neighbor is not `=` and right neighbor is not `=`.
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b':' && bytes[i + 1] == b'=' {
            let before_ok = i == 0 || bytes[i - 1] != b'=';
            let after_ok = i + 2 == bytes.len() || bytes[i + 2] != b'=';
            if before_ok && after_ok {
                let lhs = s[..i].trim();
                let rhs = s[i + 2..].trim();
                if !lhs.is_empty() && !rhs.is_empty() {
                    return Some((lhs.to_string(), rhs.to_string()));
                }
                return None;
            }
        }
        i += 1;
    }
    None
}

/// `SET <addr>;` or `RST <addr>;`.
fn parse_set_rst(stmt: &str, _upper: &str) -> Option<(LdNodeKind, String)> {
    let trimmed = stmt.trim().trim_end_matches(';').trim();
    let upper_trim = trimmed.to_ascii_uppercase();

    if first_token_is(&upper_trim, "SET") {
        let after = trimmed["SET".len()..].trim();
        if is_dvp_address(after) {
            let label = after.to_string();
            return Some((
                LdNodeKind::CoilSet {
                    address: after.to_string(),
                },
                label,
            ));
        }
        return None;
    }
    if first_token_is(&upper_trim, "RST") {
        let after = trimmed["RST".len()..].trim();
        if is_dvp_address(after) {
            let label = after.to_string();
            return Some((
                LdNodeKind::CoilRst {
                    address: after.to_string(),
                },
                label,
            ));
        }
        return None;
    }
    None
}

/// IL-style `TMR[T][A] <target> <preset>` or `CNT|DCNT <target> <preset>`.
/// The terminating `;` is optional. Label is `TMR T0 K100` / `CNT C0 K5`.
fn parse_il_instruction(stmt: &str, _upper: &str) -> Option<(LdNodeKind, String)> {
    let trimmed = stmt.trim().trim_end_matches(';').trim();
    let upper_trim = trimmed.to_ascii_uppercase();

    // Order matters: check longer variants first to avoid `TMR` matching
    // `TMRH` at offset 0.
    let timer_prefixes: &[&str] = &["TMRH", "TMRA", "TMR"];
    for prefix in timer_prefixes {
        if first_token_is(&upper_trim, prefix) {
            let after = trimmed[prefix.len()..].trim();
            return il_pair(after).map(|(target, preset)| {
                let label = format!("TMR {target} {preset}");
                (
                    LdNodeKind::TimerBlock {
                        timer: target.clone(),
                        preset: preset.clone(),
                    },
                    label,
                )
            });
        }
    }

    let counter_prefixes: &[&str] = &["DCNT", "CNT"];
    for prefix in counter_prefixes {
        if first_token_is(&upper_trim, prefix) {
            let after = trimmed[prefix.len()..].trim();
            return il_pair(after).map(|(target, preset)| {
                let label = format!("CNT {target} {preset}");
                (
                    LdNodeKind::CounterBlock {
                        counter: target.clone(),
                        preset: preset.clone(),
                    },
                    label,
                )
            });
        }
    }

    None
}

/// Split `<target> <preset>` into its two parts, both validated as
/// DVP addresses / numeric constants.
fn il_pair(after: &str) -> Option<(String, String)> {
    let mut parts = after.split_whitespace();
    let target = parts.next()?.trim();
    let preset = parts.next()?.trim();
    if parts.next().is_some() {
        // Reject trailing tokens to keep the v1 spec strict.
        return None;
    }
    if !is_dvp_address(target) {
        return None;
    }
    if !is_preset(preset) {
        return None;
    }
    Some((target.to_string(), preset.to_string()))
}

/// `<NAME>(<args>);` — `args` is a comma-separated list.
fn parse_function_call(stmt: &str) -> Option<(LdNodeKind, String)> {
    let trimmed = stmt.trim().trim_end_matches(';').trim();
    let open = trimmed.find('(')?;
    if open == 0 {
        return None;
    }
    let name = trimmed[..open].trim();
    if !is_identifier(name) {
        return None;
    }
    let close = trimmed[open..].find(')').map(|p| open + p)?;
    if close <= open + 1 {
        // Empty args — accept but record none.
        let label = format!("{name}()");
        return Some((
            LdNodeKind::FunctionCall {
                name: name.to_string(),
                args: Vec::new(),
            },
            label,
        ));
    }
    let args_str = &trimmed[open + 1..close];
    let args: Vec<String> = args_str
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if args.is_empty() {
        return None;
    }
    let label = format!("{name}({args_str})");
    Some((
        LdNodeKind::FunctionCall {
            name: name.to_string(),
            args,
        },
        label,
    ))
}

// ---------------------------------------------------------------------------
// Expression helpers
// ---------------------------------------------------------------------------

/// Convert an RHS expression to a list of contact addresses.
///
/// - `1`, `0`, `TRUE`, `FALSE` → empty (no contact, just a coil).
/// - Single identifier (e.g. `X0`) → one address.
/// - `A AND B [AND C ...]` → one address per operand (must all be identifiers).
/// - Anything else → empty (fall back to "coil only", per Note A).
fn rhs_to_contacts(rhs: &str) -> Vec<String> {
    let trimmed = rhs.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let upper = trimmed.to_ascii_uppercase();
    if matches!(upper.as_str(), "1" | "0" | "TRUE" | "FALSE") {
        return Vec::new();
    }
    if upper.contains(" AND ") {
        let mut out = Vec::new();
        for part in trimmed.split(" AND ") {
            let p = part.trim();
            if !is_dvp_address(p) {
                return Vec::new();
            }
            out.push(p.to_string());
        }
        return out;
    }
    if is_dvp_address(trimmed) {
        return vec![trimmed.to_string()];
    }
    Vec::new()
}

// ---------------------------------------------------------------------------
// Identifier / address validation
// ---------------------------------------------------------------------------

/// True for an ASCII identifier: `[A-Za-z_][A-Za-z0-9_]*`.
fn is_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// True for a DVP address: a single-letter prefix followed by digits.
/// Permissive about which letter (covers `X*`, `Y*`, `M*`, `S*`, `T*`, `C*`).
fn is_dvp_address(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(prefix) = chars.next() else {
        return false;
    };
    if !prefix.is_ascii_alphabetic() {
        return false;
    }
    let rest: String = chars.collect();
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

/// True for an IL preset: `K<n>`, `H<n>`, or a bare decimal integer.
fn is_preset(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let bytes = s.as_bytes();
    if bytes[0] == b'K' || bytes[0] == b'H' {
        return s.len() > 1 && s[1..].chars().all(|c| c.is_ascii_digit());
    }
    s.chars().all(|c| c.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// String-level utilities: block comments, statement splitting, keyword search
// ---------------------------------------------------------------------------

/// Remove `(* ... *)` block comments. Non-nesting (v1 scope). The opening
/// `(*` and closing `*)` are stripped along with everything between them.
fn strip_block_comments(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'(' && bytes[i + 1] == b'*' {
            // Find the matching `*)` (non-nesting).
            let mut j = i + 2;
            let mut found = false;
            while j + 1 < bytes.len() {
                if bytes[j] == b'*' && bytes[j + 1] == b')' {
                    found = true;
                    i = j + 2;
                    break;
                }
                j += 1;
            }
            if !found {
                // Unterminated block comment — drop the rest of the input.
                break;
            }
        } else {
            // Push the byte. For multi-byte UTF-8 we have to push the
            // whole char, not the byte, so use char_indices when copying.
            let char_start = i;
            // Find the char length.
            let ch = input[char_start..].chars().next().expect("non-empty at i");
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

/// Split a cleaned source string into statements.
///
/// A statement is either:
/// - The text between two `;` terminators (exclusive), provided the
///   intermediate text has balanced `IF` / `END_IF` keywords, or
/// - A line that does not end in `;` (preserved verbatim as a single
///   statement for IL-style instructions like `TMR T0 K100`).
///
/// While an `IF` block is open (nesting depth non-zero), lines keep
/// accumulating so multi-line `IF ... END_IF;` constructs stay one
/// statement; every other line stands alone.
fn split_statements(input: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for raw_line in input.lines() {
        let cleaned = strip_line_comment(raw_line);
        let line = cleaned.trim();
        if line.is_empty() {
            continue;
        }
        if current.len() + line.len() + 1 > MAX_STATEMENT_BYTES {
            // Defensive: drop pathological statements rather than panic.
            current.clear();
            continue;
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(line);
        // Flush whenever no IF block is currently open: this keeps
        // multi-line `IF ... END_IF;` constructs together as one
        // statement while making each remaining line its own individual
        // statement. A trailing `;`, when present, is dropped — handlers
        // add it back implicitly if needed.
        if if_depth_is_zero(&current) {
            if current.ends_with(';') {
                current.pop();
            }
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                out.push(trimmed);
            }
            current.clear();
        }
    }
    let tail = current.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

/// True when byte `b` terminates a keyword on either side: it is neither
/// ASCII-alphanumeric nor `_`. The underscore counts as part of an
/// identifier so names like `CHECK_IF_DONE` or `MY_THEN_FLAG` never
/// match bare `IF` / `THEN` / `END_IF` keywords.
fn is_boundary(b: u8) -> bool {
    !(b.is_ascii_alphanumeric() || b == b'_')
}

/// True when the number of opening `IF` keywords equals the number of
/// closing `END_IF` keywords in `s` (case-insensitive). Opening `IF`s
/// that are part of an `END_IF` are not counted as openings.
fn if_depth_is_zero(s: &str) -> bool {
    count_if_opens(s) == count_end_ifs(s)
}

/// Count opening `IF` keywords in `s` (case-insensitive). Does not count
/// the `IF` inside `END_IF` as an opener. All matching is done on bytes,
/// so non-ASCII input can never cause a char-boundary panic.
fn count_if_opens(s: &str) -> u32 {
    let bytes = s.as_bytes();
    let mut count = 0;
    let mut i = 0;
    while i + 1 < bytes.len() {
        // Skip past `END_IF` so its trailing `IF` isn't double-counted.
        if i + 6 <= bytes.len() && bytes[i..i + 6].eq_ignore_ascii_case(b"END_IF") {
            i += 6;
            continue;
        }
        if bytes[i..i + 2].eq_ignore_ascii_case(b"IF") {
            let before_ok = i == 0 || is_boundary(bytes[i - 1]);
            let after_ok = i + 2 == bytes.len() || is_boundary(bytes[i + 2]);
            if before_ok && after_ok {
                count += 1;
            }
        }
        i += 1;
    }
    count
}

/// Count closing `END_IF` keywords in `s` (uppercase).
fn count_end_ifs(s: &str) -> u32 {
    let mut count = 0;
    let mut start = 0;
    while let Some(pos) = find_keyword_ci(&s[start..], "END_IF") {
        count += 1;
        start += pos + "END_IF".len();
    }
    count
}

/// Strip an inline `// ...` comment from a single line. Returns the
/// portion of `line` before the first `//` (no `//` → original line).
fn strip_line_comment(line: &str) -> String {
    // Naive scan for `//` that is not inside a string literal. v1 doesn't
    // support string literals, so the naive scan is sufficient.
    if let Some(idx) = line.find("//") {
        return line[..idx].to_string();
    }
    line.to_string()
}

/// True if the first whitespace-separated token of `s` equals `keyword`
/// (case-insensitive).
fn first_token_is(s: &str, keyword: &str) -> bool {
    let mut iter = s.split_whitespace();
    match iter.next() {
        Some(first) => first.eq_ignore_ascii_case(keyword),
        None => false,
    }
}

/// Find `needle` in `haystack` with word boundaries (case-insensitive).
/// Returns the byte offset of the first match.
fn find_keyword_ci(haystack: &str, needle: &str) -> Option<usize> {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() || n.len() > h.len() {
        return None;
    }
    let mut i = 0;
    while i + n.len() <= h.len() {
        if h[i..i + n.len()].eq_ignore_ascii_case(n) {
            let before_ok = i == 0 || is_boundary(h[i - 1]);
            let after_ok = i + n.len() == h.len() || is_boundary(h[i + n.len()]);
            if before_ok && after_ok {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// Find the next `END_IF` keyword (case-insensitive) at or after `start`.
///
/// Retained as a small helper for ad-hoc scans; the production IF/ELSE
/// parser uses the depth-aware [`find_next_at_depth`] instead.
#[allow(dead_code)]
fn find_end_if_ci(haystack: &str, start: usize) -> Option<usize> {
    if start >= haystack.len() {
        return None;
    }
    let slice = &haystack[start..];
    find_keyword_ci(slice, "END_IF").map(|p| p + start)
}

/// The two branch terminators an IF body can contain at the same
/// nesting depth as the opening IF.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BranchKw {
    Else,
    EndIf,
}

/// Find the next `ELSE` or `END_IF` keyword at the current IF nesting
/// depth. Scans `s` from `start`, tracking IF opens (skipping past
/// `END_IF`'s trailing `IF` so it isn't double-counted) and decrements
/// on `END_IF`. Returns `(offset, kind)` for the first hit at depth 0.
///
/// Matching is done on bytes (case-insensitive), so non-ASCII input can
/// never cause a char-boundary panic.
fn find_next_at_depth(s: &str, start: usize) -> Option<(usize, BranchKw)> {
    let bytes = s.as_bytes();
    let mut depth: i32 = 0;
    let mut i = start;
    while i < bytes.len() {
        // Try END_IF first (longer keyword).
        if i + 6 <= bytes.len() && bytes[i..i + 6].eq_ignore_ascii_case(b"END_IF") {
            let before_ok = i == 0 || is_boundary(bytes[i - 1]);
            let after_ok = i + 6 == bytes.len() || is_boundary(bytes[i + 6]);
            if before_ok && after_ok {
                if depth == 0 {
                    return Some((i, BranchKw::EndIf));
                }
                depth -= 1;
                i += 6;
                continue;
            }
        }
        // Try IF (must not be the trailing IF of an END_IF, but that case
        // is already handled above by the END_IF check).
        if i + 2 <= bytes.len() && bytes[i..i + 2].eq_ignore_ascii_case(b"IF") {
            let before_ok = i == 0 || is_boundary(bytes[i - 1]);
            let after_ok = i + 2 == bytes.len() || is_boundary(bytes[i + 2]);
            if before_ok && after_ok {
                depth += 1;
                i += 2;
                continue;
            }
        }
        // Try ELSE. The bound must allow `i + 4 == len` so an ELSE at
        // the exact end of the string is still matched.
        if i + 4 <= bytes.len() && bytes[i..i + 4].eq_ignore_ascii_case(b"ELSE") {
            let before_ok = i == 0 || is_boundary(bytes[i - 1]);
            let after_ok = i + 4 == bytes.len() || is_boundary(bytes[i + 4]);
            if before_ok && after_ok {
                if depth == 0 {
                    return Some((i, BranchKw::Else));
                }
                // ELSE doesn't change IF depth.
                i += 4;
                continue;
            }
        }
        i += 1;
    }
    None
}

// ---------------------------------------------------------------------------
// Edge generation
// ---------------------------------------------------------------------------

/// Connect consecutive nodes within each `(rung, branch)` group in
/// ascending `order`. Produces no edge if `order+1` is missing (i.e.,
/// there is a gap in the sequence).
fn build_serial_edges(nodes: &[LdNode]) -> Vec<LdEdge> {
    // Group by (rung, branch), preserving insertion order via Vec.
    let mut groups: std::collections::BTreeMap<(u32, u32), Vec<&LdNode>> =
        std::collections::BTreeMap::new();
    for n in nodes {
        groups.entry((n.rung, n.branch)).or_default().push(n);
    }
    let mut edges = Vec::new();
    for (_, group) in groups {
        let mut sorted = group;
        sorted.sort_by_key(|n| n.order);
        for w in sorted.windows(2) {
            let src = w[0];
            let tgt = w[1];
            if tgt.order == src.order + 1 {
                edges.push(LdEdge {
                    id: format!("e_{}_to_{}", src.id, tgt.id),
                    source: src.id.clone(),
                    target: tgt.id.clone(),
                });
            }
        }
    }
    edges
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ladder::{LadderGraph, LdNodeKind};

    fn first_node(graph: &LadderGraph, rung: u32, order: u32) -> &LdNode {
        graph
            .nodes
            .iter()
            .find(|n| n.rung == rung && n.order == order)
            .expect("node should exist")
    }

    fn count_nodes_in_rung(graph: &LadderGraph, rung: u32) -> usize {
        graph.nodes.iter().filter(|n| n.rung == rung).count()
    }

    // --- empty / whitespace / comments ---

    #[test]
    fn parse_empty_returns_empty() {
        let g = parse_st_to_ladder("");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    #[test]
    fn parse_whitespace_returns_empty() {
        let g = parse_st_to_ladder("   \n\t \n  ");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    #[test]
    fn parse_comments_only_returns_empty() {
        let g = parse_st_to_ladder("// just a comment\n(* and a block comment *)\n");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    // --- assignment variants ---

    #[test]
    fn parse_simple_assign() {
        let g = parse_st_to_ladder("Y0 := 1;");
        assert_eq!(g.nodes.len(), 1, "coil only, no synthetic contact");
        let n = first_node(&g, 0, 0);
        assert_eq!(n.rung, 0);
        assert_eq!(n.branch, 0);
        assert_eq!(n.order, 0);
        assert_eq!(n.label, "Y0");
        assert!(matches!(n.kind, LdNodeKind::CoilOut { ref address } if address == "Y0"));
    }

    #[test]
    fn parse_assign_with_var() {
        let g = parse_st_to_ladder("Y0 := X0;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y0"
        ));
    }

    #[test]
    fn parse_assign_with_and() {
        let g = parse_st_to_ladder("Y0 := X0 AND X1;");
        assert_eq!(g.nodes.len(), 3);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { .. }
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::ContactNo { .. }
        ));
        assert!(matches!(
            first_node(&g, 0, 2).kind,
            LdNodeKind::CoilOut { .. }
        ));
        // Verify orders
        assert_eq!(first_node(&g, 0, 0).order, 0);
        assert_eq!(first_node(&g, 0, 1).order, 1);
        assert_eq!(first_node(&g, 0, 2).order, 2);
    }

    // --- IF / END_IF ---

    #[test]
    fn parse_if_then() {
        let g = parse_st_to_ladder("IF X0 THEN Y0 := 1; END_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y0"
        ));
    }

    #[test]
    fn parse_if_then_else() {
        let g = parse_st_to_ladder("IF X0 THEN Y0 := 1; ELSE Y1 := 1; END_IF;");
        assert_eq!(g.nodes.len(), 4, "2 contacts + 2 coils");
        // Rung 0 (THEN): ContactNo(X0) -> CoilOut(Y0)
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y0"
        ));
        // Rung 1 (ELSE): ContactNc(X0) -> CoilOut(Y1)
        assert!(matches!(
            first_node(&g, 1, 0).kind,
            LdNodeKind::ContactNc { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 1, 1).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y1"
        ));
        // Different rungs confirmed
        assert_ne!(first_node(&g, 0, 0).rung, first_node(&g, 1, 0).rung);
    }

    #[test]
    fn parse_set() {
        let g = parse_st_to_ladder("IF X0 THEN SET Y0; END_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { .. }
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilSet { ref address } if address == "Y0"
        ));
    }

    #[test]
    fn parse_rst() {
        let g = parse_st_to_ladder("IF X0 THEN RST Y0; END_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { .. }
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilRst { ref address } if address == "Y0"
        ));
    }

    // --- Timers and counters ---

    #[test]
    fn parse_timer_il_style() {
        let g = parse_st_to_ladder("TMR T0 K100");
        assert_eq!(g.nodes.len(), 1);
        let n = first_node(&g, 0, 0);
        assert!(matches!(
            n.kind,
            LdNodeKind::TimerBlock { ref timer, ref preset }
            if timer == "T0" && preset == "K100"
        ));
        assert_eq!(n.label, "TMR T0 K100");
    }

    #[test]
    fn parse_counter_il_style() {
        let g = parse_st_to_ladder("CNT C0 K5");
        assert_eq!(g.nodes.len(), 1);
        let n = first_node(&g, 0, 0);
        assert!(matches!(
            n.kind,
            LdNodeKind::CounterBlock { ref counter, ref preset }
            if counter == "C0" && preset == "K5"
        ));
        assert_eq!(n.label, "CNT C0 K5");
    }

    #[test]
    fn parse_timer_in_if() {
        let g = parse_st_to_ladder("IF X0 THEN TMR T0 K100; END_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { .. }
        ));
        let n = first_node(&g, 0, 1);
        assert!(matches!(
            n.kind,
            LdNodeKind::TimerBlock { ref timer, ref preset }
            if timer == "T0" && preset == "K100"
        ));
    }

    #[test]
    fn parse_counter_in_if() {
        let g = parse_st_to_ladder("IF X0 THEN CNT C0 K5; END_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { .. }
        ));
        let n = first_node(&g, 0, 1);
        assert!(matches!(
            n.kind,
            LdNodeKind::CounterBlock { ref counter, ref preset }
            if counter == "C0" && preset == "K5"
        ));
    }

    // --- Function call ---

    #[test]
    fn parse_function_call() {
        let g = parse_st_to_ladder("TON(T0, K100);");
        assert_eq!(g.nodes.len(), 1);
        let n = first_node(&g, 0, 0);
        assert!(matches!(
            n.kind,
            LdNodeKind::FunctionCall { ref name, ref args }
            if name == "TON" && args.len() == 2 && args[0] == "T0" && args[1] == "K100"
        ));
        assert_eq!(n.label, "TON(T0, K100)");
    }

    // --- Nested IFs (AND combination) ---

    #[test]
    fn parse_nested_if() {
        let g = parse_st_to_ladder("IF X0 THEN IF X1 THEN Y0 := 1; END_IF; END_IF;");
        assert_eq!(g.nodes.len(), 3);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::ContactNo { ref address } if address == "X1"
        ));
        assert!(matches!(
            first_node(&g, 0, 2).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y0"
        ));
    }

    // --- Edges, node IDs, case sensitivity ---

    #[test]
    fn parse_edges_serial() {
        let g = parse_st_to_ladder("Y0 := X0 AND X1;");
        // Two edges: r0_b0_n0 -> r0_b0_n1 -> r0_b0_n2
        assert_eq!(g.edges.len(), 2);
        let e0 = &g.edges[0];
        assert_eq!(e0.source, "r0_b0_n0");
        assert_eq!(e0.target, "r0_b0_n1");
        assert_eq!(e0.id, "e_r0_b0_n0_to_r0_b0_n1");
        let e1 = &g.edges[1];
        assert_eq!(e1.source, "r0_b0_n1");
        assert_eq!(e1.target, "r0_b0_n2");
    }

    #[test]
    fn parse_edges_skip_rung_boundary() {
        // Two rungs => edges must not cross the boundary.
        let g = parse_st_to_ladder("IF X0 THEN Y0 := 1; ELSE Y1 := 1; END_IF;");
        // Rung 0: 1 edge (ContactNo(X0) -> CoilOut(Y0))
        // Rung 1: 1 edge (ContactNc(X0) -> CoilOut(Y1))
        assert_eq!(g.edges.len(), 2);
        for e in &g.edges {
            // Source and target must share the same rung number.
            let src_rung: u32 = e
                .source
                .split('_')
                .next()
                .and_then(|s| s.strip_prefix('r'))
                .and_then(|s| s.parse().ok())
                .expect("parse src rung");
            let tgt_rung: u32 = e
                .target
                .split('_')
                .next()
                .and_then(|s| s.strip_prefix('r'))
                .and_then(|s| s.parse().ok())
                .expect("parse tgt rung");
            assert_eq!(src_rung, tgt_rung, "edge must not cross rungs");
        }
    }

    #[test]
    fn parse_node_ids_are_stable() {
        let g = parse_st_to_ladder("Y0 := X0 AND X1;");
        let ids: Vec<&str> = g.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["r0_b0_n0", "r0_b0_n1", "r0_b0_n2"]);
    }

    #[test]
    fn parse_case_insensitive_keywords() {
        let g_upper = parse_st_to_ladder("IF X0 THEN Y0 := 1; END_IF;");
        let g_lower = parse_st_to_ladder("if x0 then y0 := 1; end_if;");
        let g_mixed = parse_st_to_ladder("If x0 Then y0 := 1; End_If;");
        assert_eq!(g_upper.nodes.len(), g_lower.nodes.len());
        assert_eq!(g_upper.nodes.len(), g_mixed.nodes.len());
        assert_eq!(count_nodes_in_rung(&g_upper, 0), 2);
    }

    // --- Tauri command surface ---

    #[test]
    fn render_ladder_validates_size() {
        // 1 MiB + 1 byte
        let too_big = "Y0 := 1;".repeat(200_000) + "Y0 := 1;";
        assert!(too_big.len() > 1_048_576);
        let res = render_ladder(too_big);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("1 MB"), "error mentions limit: {err}");
    }

    #[test]
    fn render_ladder_happy_path() {
        let res = render_ladder("Y0 := X0 AND X1;".to_string());
        let g = res.expect("should succeed for small input");
        assert!(!g.nodes.is_empty());
        assert_eq!(g.nodes.len(), 3);
    }

    #[test]
    fn render_ladder_empty_input_returns_empty() {
        let g = render_ladder(String::new()).expect("empty is valid");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    // --- Adversarial: identifiers containing keyword substrings ---

    #[test]
    fn keyword_depth_counts_ignore_underscore_identifiers() {
        // `_` is part of an identifier, so keyword-shaped runs embedded
        // in names must not register as IF-block openers/closers.
        assert_eq!(count_if_opens("CHECK_IF_DONE(X0)"), 0);
        assert_eq!(count_if_opens("IF X0 THEN"), 1);
        assert_eq!(count_end_ifs("END_IF_FOO"), 0);
        assert_eq!(count_end_ifs("END_IF"), 1);
    }

    #[test]
    fn find_keyword_ci_respects_underscore_boundaries() {
        assert_eq!(find_keyword_ci("MY_THEN_FLAG X1", "THEN"), None);
        assert_eq!(find_keyword_ci("X0 THEN Y0", "THEN"), Some(3));
        assert_eq!(find_keyword_ci("end_if", "END_IF"), Some(0));
    }

    #[test]
    fn parse_keyword_substring_identifiers_keep_subsequent_rungs() {
        // Regression: `CHECK_IF_DONE` used to register a phantom `IF`
        // open, so `if_depth_is_zero` never held again and every later
        // line merged into one giant statement that failed all
        // sub-parsers and was silently dropped.
        let g =
            parse_st_to_ladder("CHECK_IF_DONE(X0);\nEND_IF_FOO();\nY0 := MY_THEN_FLAG;\nY1 := X2;");
        // Rung 0: function call. Rung 1: function call. Rung 2: coil
        // only (RHS is not a DVP address). Rung 3: contact + coil.
        assert_eq!(g.nodes.len(), 5);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::FunctionCall { ref name, .. } if name == "CHECK_IF_DONE"
        ));
        assert!(matches!(
            first_node(&g, 1, 0).kind,
            LdNodeKind::FunctionCall { ref name, .. } if name == "END_IF_FOO"
        ));
        assert!(matches!(
            first_node(&g, 2, 0).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y0"
        ));
        assert!(matches!(
            first_node(&g, 3, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X2"
        ));
        assert!(matches!(
            first_node(&g, 3, 1).kind,
            LdNodeKind::CoilOut { ref address } if address == "Y1"
        ));
    }

    // --- Adversarial: multi-line IL without semicolons ---

    #[test]
    fn parse_multiline_il_without_semicolons_are_separate_rungs() {
        // Each `;`-less line is its own statement per the documented
        // contract; joining them used to produce a single blob that
        // failed the strict two-token IL grammar and vanished.
        let stmts = split_statements("TMR T0 K100\nCNT C1 K5");
        assert_eq!(stmts, vec!["TMR T0 K100", "CNT C1 K5"]);

        let g = parse_st_to_ladder("TMR T0 K100\nCNT C1 K5");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::TimerBlock { ref timer, ref preset }
            if timer == "T0" && preset == "K100"
        ));
        assert!(matches!(
            first_node(&g, 1, 0).kind,
            LdNodeKind::CounterBlock { ref counter, ref preset }
            if counter == "C1" && preset == "K5"
        ));
    }

    #[test]
    fn parse_multiline_if_block_still_joins_lines() {
        // Guard for the split change: lines inside an open IF block keep
        // accumulating until END_IF closes the construct.
        let g = parse_st_to_ladder("IF X0 THEN\n  SET Y0;\nEND_IF;");
        assert_eq!(g.nodes.len(), 2);
        assert!(matches!(
            first_node(&g, 0, 0).kind,
            LdNodeKind::ContactNo { ref address } if address == "X0"
        ));
        assert!(matches!(
            first_node(&g, 0, 1).kind,
            LdNodeKind::CoilSet { ref address } if address == "Y0"
        ));
    }

    // --- Adversarial: Unicode case-expansion safety ---

    #[test]
    fn parse_unicode_expansion_chars_do_not_panic_and_preserve_labels() {
        // Full Unicode uppercasing changes byte lengths (`ß` -> "SS",
        // `ﬂ` -> "FL"); offsets taken from such a copy used to land
        // mid-character when slicing the original (two adjacent `ﬂ`s
        // shift the THEN offset by two bytes). ASCII-only case mapping
        // keeps offsets aligned with the source, and user text keeps
        // its original characters in labels.
        let src = "IF ﬂﬂ THEN SET Y0; END_IF;\nDRAIN_VALVE(ﬂow, straße);";
        let g = render_ladder(src.to_string()).expect("unicode input must not error");
        // Rung 0: contact + coil set. Rung 1: function call.
        assert_eq!(g.nodes.len(), 3);
        let contact = first_node(&g, 0, 0);
        assert_eq!(contact.label, "ﬂﬂ");
        assert!(matches!(
            contact.kind,
            LdNodeKind::ContactNo { ref address } if address == "ﬂﬂ"
        ));
        let call = first_node(&g, 1, 0);
        assert_eq!(call.label, "DRAIN_VALVE(ﬂow, straße)");
        assert!(matches!(
            call.kind,
            LdNodeKind::FunctionCall { ref name, ref args }
            if name == "DRAIN_VALVE" && args.as_slice() == ["ﬂow", "straße"]
        ));
    }

    // --- Adversarial: ELSE at the exact end of the string ---

    #[test]
    fn find_else_at_exact_string_end_is_matched() {
        // Off-by-one: the old `i + 4 < len` bound required one extra
        // byte after ELSE, so a trailing ELSE was invisible to the
        // depth scanner.
        let s = "IF X0 THEN SET Y0; ELSE";
        let upper = s.to_ascii_uppercase();
        let after_then = s
            .find("THEN")
            .map(|p| p + "THEN".len())
            .expect("THEN present");
        assert_eq!(
            find_next_at_depth(&upper, after_then),
            Some((s.find("ELSE").expect("ELSE present"), BranchKw::Else))
        );
    }

    #[test]
    fn parse_trailing_else_terminates_without_panic() {
        // A dangling ELSE (no closing END_IF) is silently skipped per
        // the v1 spec; the scanner must terminate cleanly, producing an
        // empty graph rather than hanging or emitting bogus rungs.
        let g = parse_st_to_ladder("IF X0 THEN SET Y0; ELSE");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }
}
