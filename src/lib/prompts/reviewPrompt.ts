import type { IOPoint } from '@/types/io'
import type { HmiTable } from '@/types/hmi'
import { DVP_CHEATSHEET } from './cheatsheet'
import { formatIOTable } from './stPrompt'
import { formatHmiTable } from './chatPrompt'

/**
 * Builds the AI code review prompt.
 *
 * The review prompt is constructed from:
 *  1. The Delta DVP cheatsheet (immutable instruction set reference)
 *  2. The I/O table as IMMUTABLE CONTEXT
 *  3. The HMI table as IMMUTABLE CONTEXT
 *  4. The generated ST code
 *  5. A structured review request asking for:
 *     - Explanation of what the code does
 *     - List of timers/counters with preset values
 *     - Edge cases and potential issues
 *
 * The response should be plain text with bullet points, suitable for
 * rendering directly in the AI Review panel.
 */
export function buildReviewPrompt(
  stCode: string,
  ioTable: IOPoint[],
  hmiTable: HmiTable,
  modelLabel?: string,
): string {
  const ioContext = formatIOTable(ioTable)
  const hmiContext = formatHmiTable(hmiTable)
  const modelInfo = modelLabel
    ? `Target PLC: Delta DVP-${modelLabel.toUpperCase()}`
    : 'Target PLC: Delta DVP Series (model not selected)'

  return `${DVP_CHEATSHEET}

## I/O Table — IMMUTABLE CONTEXT
The following I/O points are already assigned. You MUST use ONLY these addresses.
DO NOT invent new addresses or reassign existing ones.

${ioContext}

## HMI Table — IMMUTABLE CONTEXT
The following HMI tag bindings are already reserved. You MUST use ONLY these
reserved M addresses when referencing HMI elements. DO NOT reassign or
duplicate them.

${hmiContext}

  ## Generated ST Code — TO BE REVIEWED
${modelInfo}
Language: The original description may have been English or Arabic/hybrid. Review the CODE only (do not translate).

\`\`\`st
${stCode}
\`\`\`

## Review Task
Perform a safety and correctness review of the Structured Text code above.
Address the user's request by providing the following in plain text with
bullet points — NO markdown formatting, NO code fences, NO extra text:

1. **What the code does** — A concise functional description (2-3 sentences)
2. **Timers & Counters** — List each timer (T) and counter (C) used with
   its preset value (K). If none, state "None".
3. **Edge Cases & Potential Issues** — Bullet points for:
   - Uninitialized state risks
   - Race conditions or latch dependency order
   - Missing reset/initialization logic
   - Address usage outside I/O table bounds
   - HMI reference validity
   - Any deviation from DVP instruction set
   If no issues found, state "No significant issues detected."
`
}

/**
 * Parses the AI review response into structured sections for rendering.
 * Expects plain text with bullet points (dash or asterisk prefix).
 */
export interface ReviewSections {
  description: string
  timersCounters: string
  edgeCases: string
}

export function parseReviewResponse(raw: string): ReviewSections {
  const lines = raw.trim().split('\n').map((l) => l.trim())

  let currentSection: 'description' | 'timers' | 'edgeCases' | null = null
  const description: string[] = []
  const timersCounters: string[] = []
  const edgeCases: string[] = []

  for (const line of lines) {
    const lower = line.toLowerCase()

    if (lower.startsWith('1.') || lower.startsWith('what the code does')) {
      currentSection = 'description'
      continue
    }
    if (lower.startsWith('2.') || lower.startsWith('timers')) {
      currentSection = 'timers'
      continue
    }
    if (lower.startsWith('3.') || lower.startsWith('edge cases')) {
      currentSection = 'edgeCases'
      continue
    }

    if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) {
      const content = line.slice(1).trim()
      switch (currentSection) {
        case 'description':
          description.push(content)
          break
        case 'timers':
          timersCounters.push(content)
          break
        case 'edgeCases':
          edgeCases.push(content)
          break
      }
    } else if (line.length > 0 && currentSection) {
      // Continuation line
      switch (currentSection) {
        case 'description':
          description[description.length - 1] += ` ${line}`
          break
        case 'timers':
          timersCounters[timersCounters.length - 1] += ` ${line}`
          break
        case 'edgeCases':
          edgeCases[edgeCases.length - 1] += ` ${line}`
          break
      }
    }
  }

  return {
    description: description.join(' ').trim(),
    timersCounters: timersCounters.join('\n').trim(),
    edgeCases: edgeCases.join('\n').trim(),
  }
}