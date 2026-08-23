/**
 * Chat history model for the LLM conversation panel (added in M6).
 *
 * A `ChatMessage` is a single turn in the project's dialogue with the LLM.
 * The shape is intentionally minimal in Phase 1 — extensions (IL/LD
 * proposals, citations, tool calls) land in later milestones.
 */

/** Who authored a single chat turn in the project history. */
export type ChatRole = 'user' | 'assistant' | 'system'

/**
 * A proposal attached to an assistant chat turn. The LLM emits these so the
 * UI can show "Apply", "Reject", or "View diff" controls in the chat panel.
 */
export interface ChatProposal {
  /** Proposed Structured Text code. */
  st: string
  /** Human-readable summary of what this proposal changes. */
  summary: string
}

/** A single turn in the project's chat history with the LLM. */
export interface ChatMessage {
  /** When this turn was authored (ISO 8601 timestamp, UTC). */
  timestamp: string
  /** Who authored this turn. */
  role: ChatRole
  /** The raw text content of the turn. */
  content: string
  /**
   * Optional assistant proposal. User/system turns never carry a proposal.
   * If the assistant is asking a clarifying question, this is `undefined`.
   */
  proposal?: ChatProposal
}
