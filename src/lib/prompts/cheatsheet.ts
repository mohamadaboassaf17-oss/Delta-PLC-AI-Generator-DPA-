// Delta DVP Instruction Set Reference
// Injected into LLM system prompts to constrain output to real DVP instructions only.
// Source: Delta DVP Programming Manual (DVP-PLC-101)

export const DVP_CHEATSHEET = `
## Delta DVP Instruction Set — Supported Instructions

### Basic Logic Instructions
LD  — Load (Normally Open contact start)
LDI — Load Inverse (Normally Closed contact start)
AND — Series Normally Open contact
ANI — Series Normally Closed contact
OR  — Parallel Normally Open contact
ORI — Parallel Normally Closed contact
ANB — Block series connection
ORB — Block parallel connection
OUT — Output coil
SET — Set latch (bit stays ON)
RST — Reset latch (bit turns OFF)

### Timers
TMR  — On-Delay timer, 100ms time base
  Syntax: TMR T<n> K<value>
  Example: TMR T0 K50  → 5.0 seconds (50 × 100ms)
TMRH — On-Delay timer, 10ms time base
TMRA — Accumulating On-Delay timer, 1ms base

### Counters
CNT  — 16-bit Up Counter
  Syntax: CNT C<n> K<value>
  Example: CNT C0 K10  → count 10 events
DCNT — 32-bit Up/Down Counter

### Comparison
CMP — Compare (S1 == S2)
ZCP — Zone Compare (S1 <= S <= S2)
=, <>, >, <, >=, <= — Direct comparison in ST

### Math (16-bit)
ADD, SUB, MUL, DIV, INC, DEC
Also: WAND, WOR, WXOR, NEG (bitwise)

### Data Movement
MOV  — Move (16-bit), Syntax: MOV S D
DMOV — Double-word Move (32-bit)
BMOV — Block Move, FMOV — Fill Move
CML  — Complement, XCH — Exchange

### Program Control
MC / MCR  — Master Control (Start / Reset)
CJ        — Conditional Jump (to P<n> pointer)
CALL/SRET — Subroutine Call / Return
EI  / DI  — Enable / Disable Interrupts
FEND      — First End (separates main from subroutines)
WDT       — Watchdog Timer Reset
FOR/NEXT  — Loop (max 5 nesting)
END       — Program End (required at end)

### Device Prefixes (address format)
X = Input relay   (bit)
Y = Output relay  (bit)
M = Internal relay (bit)
S = Step relay    (bit)
T = Timer         (bit + word)
C = Counter       (bit + word)
D = Data register (word, 16-bit)
K = Decimal constant prefix (e.g., K50)
H = Hex constant prefix (e.g., H0F)

### Structured Text (ST) Syntax Rules
- All keywords UPPERCASE: IF, THEN, ELSE, ELSIF, END_IF, CASE, FOR, TO, BY, DO, END_FOR, WHILE, END_WHILE, REPEAT, UNTIL, END_REPEAT, RETURN
- Assignment: variable := expression;
- Boolean operators: AND, OR, NOT, XOR
- Comparison: =, <>, >, <, >=, <=
- Semicolons terminate all statements
- Comments: // single-line, (* multi-line *)
- Timer format: TON(T<n>, K<value>) or TMR T<n> K<value>
- Counter format: CTU(C<n>, K<value>) or CNT C<n> K<value>
- SET and RST use coil syntax: SET Y0; RST M10;

### Important Constraints
- DO NOT invent instructions not listed above
- DO NOT use non-Delta syntax (e.g., no "TONR", no "CTD" alone)
- Timers T0-T127 in DVP-SS2/SE; T0-T255 in SX2/SV2
- Counters C0-C127 in DVP-SS2/SE; C0-C255 in SX2/SV2
- Maximum 5 nested FOR loops
- END statement MUST be the last instruction of every program

### HMI Inference Rules
- Emit a JSON array of HMI tags describing the operator panel implied by the description.
- Element types: Button (user action -> triggers a write to a PLC bit), Lamp (visual state reflecting a PLC bit), Alarm (fault condition that should drive a notification), NumericDisplay (read-only numeric from a D register — not wired in MVP, skip unless a D register is required), Setpoint (user-editable numeric value).
- The "plcRef" field MUST be an address that already exists in the I/O Table. If the user's description names something that doesn't exist in the table, infer a sensible M-relay reference (e.g., M100, M101) and note it in the label.
- The "address" field in HMI tags is RESERVED by program post-processing — you MUST always emit "null" for it.
- JSON shape: {"address": null, "type": "Button", "label": "Start", "plcRef": "M0"}
- Output: a single JSON array, no comments, no trailing commas, no markdown fences.
`
