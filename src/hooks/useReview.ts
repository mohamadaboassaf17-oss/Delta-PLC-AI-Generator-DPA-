import { useState, useCallback, useRef, useEffect } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { buildReviewPrompt, parseReviewResponse, type ReviewSections } from '@/lib/prompts/reviewPrompt'
import {
  secretGet,
  settingsGet,
  modifyCode,
} from '@/lib/tauriApi'
import { useProject } from '@/hooks/useProject'

export interface UseReviewResult {
  isReviewing: boolean
  review: ReviewSections | null
  reviewError: string | null
  startReview: () => Promise<void>
  clearReview: () => void
}

export function useReview(): UseReviewResult {
  const { project } = useProject()
  const [isReviewing, setIsReviewing] = useState(false)
  const [review, setReview] = useState<ReviewSections | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const rawBuffer = useRef('')
  const isActive = useRef(false)
  const unlistenFns = useRef<UnlistenFn[]>([])

  const cleanupListeners = useCallback(() => {
    for (const fn of unlistenFns.current) {
      fn()
    }
    unlistenFns.current = []
  }, [])

  const clearReview = useCallback(() => {
    isActive.current = false
    setIsReviewing(false)
    setReview(null)
    setReviewError(null)
    rawBuffer.current = ''
    cleanupListeners()
  }, [cleanupListeners])

  const startReview = useCallback(async () => {
    if (!project) {
      setReviewError('No project loaded')
      return
    }
    const stCode = project.generated?.st ?? ''
    if (!stCode.trim()) {
      setReviewError('No generated code to review. Generate code first.')
      return
    }

    setReviewError(null)
    setReview(null)
    setIsReviewing(true)
    rawBuffer.current = ''
    isActive.current = true

    try {
      const settings = await settingsGet()
      const provider = settings.active_provider
      const apiKey = await secretGet(provider)

      if (!apiKey) {
        setReviewError(
          `No API key found for ${provider}. Please configure your API key in Settings.`,
        )
        setIsReviewing(false)
        isActive.current = false
        return
      }

      const hmiTable = project.hmi_table ?? { tags: [], reservedMRange: null, model: null }
      const prompt = buildReviewPrompt(
        stCode,
        project.io_table ?? [],
        hmiTable,
        project.meta?.model,
      )
      const model = settings.generation.model

      const tokenUnlisten = await listen<string>('modification-token', (event) => {
        rawBuffer.current += event.payload
      })

      const doneUnlisten = await listen<{ stCode: string; rawResponse: string }>(
        'modification-done',
        (event) => {
          if (!isActive.current) return
          isActive.current = false
          // The review reuses the modification channel; the model returns
          // plain text (no markers), so we just parse the raw response.
          const text = event.payload?.rawResponse ?? rawBuffer.current
          setReview(parseReviewResponse(text))
          setIsReviewing(false)
          cleanupListeners()
        },
      )

      const errorUnlisten = await listen<{ message: string }>(
        'modification-error',
        (event) => {
          if (!isActive.current) return
          isActive.current = false
          setReviewError(event.payload.message || 'Code review failed')
          setIsReviewing(false)
          cleanupListeners()
        },
      )

      unlistenFns.current = [tokenUnlisten, doneUnlisten, errorUnlisten]

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
        setReviewError(result.error)
        setIsReviewing(false)
        cleanupListeners()
      }
    } catch (err) {
      if (!isActive.current) return
      isActive.current = false
      setReviewError(err instanceof Error ? err.message : 'Code review failed')
      setIsReviewing(false)
      cleanupListeners()
    }
  }, [project, cleanupListeners])

  useEffect(() => {
    return () => {
      cleanupListeners()
    }
  }, [cleanupListeners])

  return {
    isReviewing,
    review,
    reviewError,
    startReview,
    clearReview,
  }
}
