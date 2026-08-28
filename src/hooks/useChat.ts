import { useState, useCallback, useRef, useEffect } from 'react'
import { useProject } from '@/hooks/useProject'
import { buildChatPrompt } from '@/lib/prompts/chatPrompt'
import { injectLabelComments } from '@/lib/prompts/stPrompt'
import { settingsGet, secretGet, modifyCode, type ModificationDone, type ModificationError } from '@/lib/tauriApi'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ChatMessage } from '@/types/chat'
import type { LadderGraph } from '@/types/ladder'

export interface UseChatResult {
  isModifying: boolean
  streamingSt: string
  modificationError: string | null
  showDiff: boolean
  pendingSt: string | null
  startModification: (message: string) => Promise<void>
  applyModification: () => void
  rejectModification: () => void
  clearModification: () => void
}

/**
 * Single source of truth for the chat-driven code-modification lifecycle
 * (H7 fix: ChatPanel.tsx previously carried a near-verbatim inline copy of
 * this hook whose modifyCode call omitted customBaseUrl/customModelName,
 * breaking Custom-provider modifications).
 *
 * Reconciliation decisions vs the deleted inline copy:
 * - modifyCode always receives customBaseUrl/customModelName (hook behavior
 *   kept; the copy's omission was the actual H7 bug).
 * - applyModification calls setGenerated (behavior taken from the inline
 *   copy; the old hook version silently dropped the applied ST from the
 *   project) and prefers the streamed ldGraph when present.
 * - Assistant turn on accept records content 'Applied modification from
 *   chat' plus a char-count summary (inline-copy wording preserved because
 *   that is what users saw in production).
 * - rejectModification restores streamingSt to project.generated.st instead
 *   of clearing to ''; this preserves the visible behavior where rejecting
 *   keeps the current code displayed. clearModification stays available as
 *   the explicit full-reset escape hatch.
 * - The token handler now guards on isActive.current (improvement carried
 *   deliberately: late tokens after done/error can no longer mutate
 *   streamingSt).
 */
export function useChat(): UseChatResult {
  const { project, addChatMessage, chatHistory, setGenerated } = useProject()
  const [isModifying, setIsModifying] = useState(false)
  const [streamingSt, setStreamingSt] = useState('')
  const [modificationError, setModificationError] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [pendingSt, setPendingSt] = useState<string | null>(null)
  const [pendingLdGraph, setPendingLdGraph] = useState<LadderGraph | null>(null)
  const rawBuffer = useRef('')
  const isActive = useRef(false)
  const unlistenFns = useRef<UnlistenFn[]>([])

  const cleanupListeners = useCallback(() => {
    for (const fn of unlistenFns.current) {
      fn()
    }
    unlistenFns.current = []
  }, [])

  useEffect(() => {
    return () => {
      cleanupListeners()
    }
  }, [cleanupListeners])

  const handleModificationDone = useCallback(
    (event: { payload: ModificationDone }) => {
      if (!isActive.current) return
      isActive.current = false

      const st = injectLabelComments(event.payload.stCode, project?.io_table ?? [])
      setStreamingSt(st)
      setPendingSt(st)
      setPendingLdGraph(event.payload.ldGraph ?? null)
      setIsModifying(false)
      cleanupListeners()
      setShowDiff(true)
    },
    [cleanupListeners, project],
  )

  const handleModificationError = useCallback(
    (event: { payload: ModificationError }) => {
      if (!isActive.current) return
      isActive.current = false

      setModificationError(event.payload.message || 'Modification failed')
      setIsModifying(false)
      cleanupListeners()
    },
    [cleanupListeners],
  )

  const handleModificationToken = useCallback((event: { payload: string }) => {
    if (!isActive.current) return
    rawBuffer.current += event.payload
    setStreamingSt(rawBuffer.current)
  }, [])

  const startModification = useCallback(
    async (message: string) => {
      if (!message.trim() || !project) return

      setModificationError(null)
      setIsModifying(true)
      setStreamingSt('')
      rawBuffer.current = ''
      isActive.current = true

      // Add user message to history
      const userMessage: ChatMessage = {
        timestamp: new Date().toISOString(),
        role: 'user',
        content: message,
      }
      addChatMessage(userMessage)

      try {
        const settings = await settingsGet()
        const provider = settings.active_provider
        const apiKey = await secretGet(provider)

        if (!apiKey) {
          setModificationError(`No API key found for ${provider}. Please configure your API key in Settings.`)
          setIsModifying(false)
          isActive.current = false
          return
        }

        // Build the context-anchored prompt
        const prompt = buildChatPrompt(
          message,
          project.io_table ?? [],
          project.hmi_table ?? { tags: [], reservedMRange: null, model: null },
          project.generated?.st ?? '',
          chatHistory,
        )

        const model = settings.generation.model

        const tokenUnlisten = await listen<string>('modification-token', handleModificationToken)
        const doneUnlisten = await listen<ModificationDone>('modification-done', handleModificationDone)
        const errorUnlisten = await listen<ModificationError>('modification-error', handleModificationError)

        unlistenFns.current = [tokenUnlisten, doneUnlisten, errorUnlisten]

        // H7 fix: custom-provider requests MUST forward the base URL and
        // model name or the backend targets an empty endpoint.
        const customBaseUrl =
          provider === 'custom' ? (settings.custom_base_url ?? '').trim() : ''
        const customModelName =
          provider === 'custom' ? (settings.custom_model_name ?? '').trim() : ''
        const result = await modifyCode(
          prompt,
          provider,
          model,
          apiKey,
          customBaseUrl,
          customModelName,
        )
        if (result.error && isActive.current) {
          isActive.current = false
          setModificationError(result.error)
          setIsModifying(false)
          cleanupListeners()
        }
      } catch (err) {
        if (!isActive.current) return
        isActive.current = false
        setModificationError(err instanceof Error ? err.message : 'Modification failed')
        setIsModifying(false)
        cleanupListeners()
      }
    },
    [project, addChatMessage, chatHistory, handleModificationToken, handleModificationDone, handleModificationError, cleanupListeners],
  )

  const applyModification = useCallback(() => {
    if (pendingSt && project) {
      // Apply the modified ST to the project so the ST output panel,
      // ladder diagram, and conflict scanner all pick it up.
      const previousSt = project.generated?.st ?? ''
      setGenerated({
        st: pendingSt,
        il: project.generated?.il,
        // Prefer the Ladder graph returned by the LLM stream; fall
        // back to whatever was previously generated (rare).
        ld: pendingLdGraph ?? project.generated?.ld,
        generated_at: new Date().toISOString(),
        model: project.generated?.model,
        prompt: project.generated?.prompt,
      })

      // Record the assistant turn in chat history so the LLM sees
      // its own accepted proposal on subsequent turns.
      const assistantMessage: ChatMessage = {
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: 'Applied modification from chat',
        proposal: {
          st: pendingSt,
          summary: `Replaced previous ST (${previousSt.length} chars) with new ST (${pendingSt.length} chars).`,
        },
      }
      addChatMessage(assistantMessage)
      setPendingSt(null)
      setPendingLdGraph(null)
      setShowDiff(false)
      setStreamingSt(pendingSt)
    }
  }, [pendingSt, pendingLdGraph, project, addChatMessage, setGenerated])

  const rejectModification = useCallback(() => {
    setPendingSt(null)
    setPendingLdGraph(null)
    setShowDiff(false)
    // Rejecting keeps the previously generated ST visible rather than
    // blanking the stream area — see reconciliation notes above.
    setStreamingSt(project?.generated?.st ?? '')
  }, [project])

  const clearModification = useCallback(() => {
    setIsModifying(false)
    setStreamingSt('')
    setModificationError(null)
    setShowDiff(false)
    setPendingSt(null)
    setPendingLdGraph(null)
    rawBuffer.current = ''
    isActive.current = false
    cleanupListeners()
  }, [cleanupListeners])

  return {
    isModifying,
    streamingSt,
    modificationError,
    showDiff,
    pendingSt,
    startModification,
    applyModification,
    rejectModification,
    clearModification,
  }
}
