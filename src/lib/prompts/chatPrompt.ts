import type { ChatMessage } from '@/types/chat'
import type { HmiTable, HMITag } from '@/types/hmi'
import type { IOPoint } from '@/types/io'
import { DVP_CHEATSHEET } from './cheatsheet'
import { formatIOTable } from './stPrompt'
import { sanitizePromptInput } from './sanitize'

/**
 * Renders the HMI table as two markdown sections: PLC Tags and HMI Tags.
 * The project model exposes a single `HMITag[]`; both sections draw from the
 * same array but emphasize different column subsets so the LLM sees the data
 * in the form most useful for the kind of change being requested.
 *
 * Columns:
 *  - PLC Tags: address, name, dataType, comment
 *  - HMI Tags: address, name, sourceTag, dataType, comment
 *
 * When `hmi.tags` is empty each section renders an inline placeholder line
 * rather than a header-only table, so the LLM can distinguish "no HMI
 * defined" from "HMI omitted by mistake".
 */
export function formatHmiTable(hmi: HmiTable): string {
  const plcSection = renderHmiSection(
    'PLC Tags (Used as PLC Memory)',
    ['Address', 'Name', 'DataType', 'Comment'],
    hmi.tags,
    (tag) => ({
      Address: tag.address ?? '-',
      Name: tag.label || '-',
      DataType: tag.type,
      Comment: '-',
    }),
    '(no PLC tags defined)',
  )

  const hmiSection = renderHmiSection(
    'HMI Tags (Linked to HMI Display)',
    ['Address', 'Name', 'SourceTag', 'DataType', 'Comment'],
    hmi.tags,
    (tag) => ({
      Address: tag.address ?? '-',
      Name: tag.label || '-',
      SourceTag: tag.plcRef,
      DataType: tag.type,
      Comment: '-',
    }),
    '(no HMI tags defined)',
  )

  return [plcSection, hmiSection].join('\n\n')
}

interface ColumnValues {
  [column: string]: string
}

function renderHmiSection(
  title: string,
  headers: string[],
  tags: HMITag[],
  mapRow: (tag: HMITag) => ColumnValues,
  emptyPlaceholder: string,
): string {
  const lines: string[] = [`**${title}**`]
  if (tags.length === 0) {
    lines.push('', emptyPlaceholder)
    return lines.join('\n')
  }

  const headerRow = '| ' + headers.map((h) => h.padEnd(10)).join(' | ') + ' |'
  const sepRow = '|' + headers.map((h) => '-'.repeat(h.length + 10)).join('|') + '|'
  const dataRows = tags.map((tag) => {
    const values = mapRow(tag)
    return (
      '| ' +
      headers
        .map((h) => (values[h] ?? '-').padEnd(10))
        .join(' | ') +
      ' |'
    )
  })

  lines.push('', headerRow, sepRow, ...dataRows)
  return lines.join('\n')
}

/**
 * Builds the full chat prompt for a ST modification request.
 *
 * The prompt is a single string. It bundles:
 *  1. The Delta DVP cheatsheet (immutable instruction set).
 *  2. The I/O table as IMMUTABLE CONTEXT.
 *  3. The HMI table as IMMUTABLE CONTEXT.
 *  4. The current ST program in a fenced code block.
 *  5. The user's modification request.
 *  6. Strict output instructions: emit exactly one `---ST---` / `---END-ST---`
 *     block containing the full revised program.
 *
 * `history` is accepted now so the signature is stable for Phase 2, but the
 * Phase 1 implementation injects only the current turn.
 */
export function buildChatPrompt(
  userMessage: string,
  ioTable: IOPoint[],
  hmiTable: HmiTable,
  currentSt: string,
  history?: ChatMessage[],
): string {
  const ioContext = formatIOTable(ioTable)
  const hmiContext = formatHmiTable(hmiTable)
  const stBlock = currentSt
    ? '```st\n' + currentSt + '\n```'
    : '_(no ST code has been generated yet)_'

  // TODO(phase-2): when multi-turn history lands, fold `history` (filtered
  // and length-capped) into the prompt as a chronological transcript so the
  // LLM can see prior turns before the current request. Phase 1 only injects
  // the immutable context plus the current turn.
  void history

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

## Current ST Code — IMMUTABLE CONTEXT
This is the program the user wants you to modify. Preserve every address that
is not explicitly part of the modification request, and keep all keywords
UPPERCASE per the cheatsheet.

${stBlock}

## User Modification Request
The user is asking for a specific change to the ST code above. Address ONLY
the change they described — do not rewrite unrelated sections.

${sanitizePromptInput(userMessage)}

## Output Requirements
Respond with ONLY the full revised ST program. The response must start and
end with the exact markers shown below — no explanations, no markdown fences
beyond the markers themselves, no extra text.

---ST---
(Complete revised ST program here)
---END-ST---`
}
