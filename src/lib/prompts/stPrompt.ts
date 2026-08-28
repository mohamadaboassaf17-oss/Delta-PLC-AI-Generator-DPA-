import type { IOPoint } from '@/types/io'
import { DVP_CHEATSHEET } from './cheatsheet'
import { sanitizePromptInput } from './sanitize'

/**
 * Formats the I/O table as a markdown table for the LLM context.
 * This is the "context anchor" — it prevents the LLM from inventing addresses.
 */
export function formatIOTable(ioTable: IOPoint[]): string {
  if (ioTable.length === 0) {
    return '(No I/O points defined — use only addresses X0, Y0, M0-M511)'
  }

  const header = '| Address | Type   | Label | Default |'
  const sep = '|---------|--------|-------|---------|'
  const rows = ioTable.map((p) => {
    const addr = p.address.padEnd(7)
    const type = p.type.padEnd(6)
    const label = p.label || '-'
    const def = p.defaultValue || '-'
    return `| ${addr} | ${type} | ${label} | ${def} |`
  })

  return [header, sep, ...rows].join('\n')
}

/**
 * Builds the full ST generation prompt including cheatsheet, I/O table context, and task.
 */
export function buildStPrompt(
  description: string,
  ioTable: IOPoint[],
  modelLabel?: string,
): string {
  const ioContext = formatIOTable(ioTable)
  const modelInfo = modelLabel
    ? `Target PLC: Delta DVP-${modelLabel.toUpperCase()}`
    : 'Target PLC: Delta DVP Series (model not selected)'

  return `${DVP_CHEATSHEET}

## I/O Table — IMMUTABLE CONTEXT
The following I/O points are already assigned. You MUST use ONLY these addresses.
DO NOT invent new addresses or reassign existing ones.

${ioContext}

## Generation Task
${modelInfo}
Language: The description below may be English or Arabic/hybrid (Arabic + English engineering terms). Interpret it as the automation requirement regardless of language.

Generate PLC code for the following automation requirement:

${sanitizePromptInput(description)}

## Output Requirements
Generate THREE code blocks separated by the exact markers shown below.
Output ONLY the code — no explanations, no markdown fences, no extra text.

---ST---
(Structured Text code here — IEC 61131-3 syntax, Delta DVP compatible)
---IL---
(Instruction List code here — Delta DVP mnemonic format)
---HMI---
(JSON array of HMI tag objects describing the operator panel — see HMI Tag Inference below)

## HMI Tag Inference
After the IL block, emit a THIRD block containing a JSON array of HMI tag objects.
Each tag describes one operator-panel element the user would need to monitor or control
the program you just generated.

Rules:
- One JSON object per element. The full set is wrapped in a single JSON array.
- The "address" field MUST be "null" — the program post-processing reserves the actual HMI address.
- The "plcRef" field MUST be an address that already exists in the I/O Table above.
  If the description references something that is not in the table, infer a sensible
  M-relay reference (e.g., M100, M101, ...) and append "(inferred)" to the label.
- Element types: Button, Lamp, Alarm, NumericDisplay, Setpoint (see Delta DVP cheatsheet).
- Output: a single JSON array, no comments, no trailing commas, no markdown fences.

## Strict Rules
1. Use ONLY instructions listed in the Delta DVP Instruction Set above
2. Use ONLY device addresses from the I/O Table above (X, Y, M, T, C, S, D)
3. All ST keywords MUST be UPPERCASE (IF, THEN, ELSE, END_IF, etc.)
4. All statements MUST end with semicolons
5. Timer presets: TMR T<n> K<value>  (K50 = 5.0 seconds at 100ms base)
6. Counter syntax: CNT C<n> K<value>
7. Include // comments referencing I/O labels (e.g., // Start Button)
8. Every IF must have END_IF. Every FOR must have END_FOR
9. END statement MUST be the very last line of the program
10. If you need a coil that latches, use SET/RST (not OTL/OTU — those don't exist in DVP)
11. Output ONLY the three code blocks separated by ---ST---, ---IL---, and ---HMI--- markers
12. NO markdown code fences, NO explanations, NO additional text`
}

/**
 * Parses the LLM response to extract ST, IL, and HMI tag blocks.
 * The response format is:
 *   ---ST---\n<st code>\n---IL---\n<il code>\n---HMI---\n<hmi json>
 */
export function parseGeneratedCode(raw: string): { st: string; il: string; hmi: string } {
  const stMatch = raw.match(/---ST---\s*\n([\s\S]*?)\n\s*---IL---/)
  const ilMatch = raw.match(/---IL---\s*\n([\s\S]*?)\n\s*---HMI---/)
  const hmiMatch = raw.match(/---HMI---\s*\n([\s\S]*)$/)

  return {
    st: stMatch ? stMatch[1].trim() : raw.trim(),
    il: ilMatch ? ilMatch[1].trim() : '',
    hmi: hmiMatch ? hmiMatch[1].trim() : '',
  }
}

/**
 * M3 — Deterministic label injection.
 *
 * Ensures every I/O label appears as a `//` comment directly above the
 * first ST line that references its address. This is the authoritative
 * post-processor for PRD §4.4 / tasks.md M3-5: the LLM is *requested* to
 * emit comments (Strict Rule 7) but this pass guarantees the invariant
 * even when the model omits them. Idempotent — running twice yields the
 * same output.
 */
export function injectLabelComments(st: string, ioTable: IOPoint[]): string {
  if (!st || ioTable.length === 0) return st
  const labelMap = new Map<string, string>()
  for (const p of ioTable) {
    const label = p.label?.trim()
    if (label) labelMap.set(p.address.toUpperCase(), label)
  }
  if (labelMap.size === 0) return st

  const lines = st.split('\n')
  const out: string[] = []
  const addrRe = /\b([XYMSTD]\d+)\b/gi

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('(*')) {
      out.push(line)
      continue
    }
    const found: string[] = []
    const seen = new Set<string>()
    let m: RegExpExecArray | null
    // reset lastIndex for each line
    addrRe.lastIndex = 0
    while ((m = addrRe.exec(line)) !== null) {
      const addr = m[0].toUpperCase()
      if (seen.has(addr)) continue
      seen.add(addr)
      const label = labelMap.get(addr)
      if (label && !found.includes(label)) found.push(label)
    }
    if (found.length === 0) {
      out.push(line)
      continue
    }
    // Idempotency: if the immediately preceding output lines are exactly
    // the same `// label` sequence, don't duplicate.
    let alreadyPresent = false
    if (out.length >= found.length) {
      alreadyPresent = found.every((lab, idx) => {
        const prev = out[out.length - found.length + idx]
        return prev.trim() === `// ${lab}`
      })
    }
    if (!alreadyPresent) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      for (const lab of found) {
        // avoid duplicating a single trailing comment
        if (out.length > 0 && out[out.length - 1].trim() === `// ${lab}`) continue
        out.push(`${indent}// ${lab}`)
      }
    }
    out.push(line)
  }
  return out.join('\n')
}
