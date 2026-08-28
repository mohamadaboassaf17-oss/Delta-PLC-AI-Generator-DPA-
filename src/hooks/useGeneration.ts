import { useState, useCallback, useRef, useEffect } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { buildStPrompt, parseGeneratedCode, injectLabelComments } from '@/lib/prompts/stPrompt'
import { secretGet, settingsGet, generateCode, dvpListModels, type DvpModelSpec } from '@/lib/tauriApi'
import { processHmiFromLlm, type ProcessHmiInput } from '@/lib/hmi'
import { useProject } from '@/hooks/useProject'
import type { GeneratedCode } from '@/types/project'
import type { LadderGraph } from '@/types/ladder'

export interface UseGenerationResult {
  isGenerating: boolean
  streamingSt: string
  streamingIl: string
  generationError: string | null
  startGeneration: (description: string) => Promise<void>
  clearGeneration: () => void
}

/** Safe default `maxM` used when the DVP model registry is not yet cached. */
const DEFAULT_MAX_M = 512

/** Shape of the `generation-done` event payload emitted by the Rust backend. */
interface GenerationDonePayload {
  stCode: string
  ilCode: string
  ldGraph: LadderGraph | null
  rawResponse: string
  hmiTagsRaw: string
}

export function useGeneration(): UseGenerationResult {
  const { project, setGenerated, setHmiTable } = useProject()
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingSt, setStreamingSt] = useState('')
  const [streamingIl, setStreamingIl] = useState('')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const rawBuffer = useRef('')
  const isActive = useRef(false)
  const unlistenFns = useRef<UnlistenFn[]>([])
  const modelsRef = useRef<DvpModelSpec[] | null>(null)
  const modelsLoadingRef = useRef<Promise<void> | null>(null)

  const ensureModelsLoaded = useCallback((): void => {
    if (modelsRef.current !== null || modelsLoadingRef.current !== null) return
    const promise = dvpListModels()
      .then((result) => {
        if ('data' in result) {
          modelsRef.current = result.data
        }
      })
      .catch(() => {
        // Cache stays null → next call falls back to DEFAULT_MAX_M.
      })
      .finally(() => {
        modelsLoadingRef.current = null
      })
    modelsLoadingRef.current = promise
  }, [])

  const resolveMaxM = useCallback((): number => {
    const models = modelsRef.current
    if (models === null) return DEFAULT_MAX_M
    const projectModel = project?.meta?.model
    if (projectModel === undefined || projectModel === null || projectModel === '') {
      return DEFAULT_MAX_M
    }
    const match = models.find((m) => m.label === projectModel)
    return match?.max_m ?? DEFAULT_MAX_M
  }, [project])

  const cleanupListeners = useCallback(() => {
    for (const fn of unlistenFns.current) {
      fn()
    }
    unlistenFns.current = []
  }, [])

  const clearGeneration = useCallback(() => {
    isActive.current = false
    setIsGenerating(false)
    setStreamingSt('')
    setStreamingIl('')
    setGenerationError(null)
    rawBuffer.current = ''
    cleanupListeners()
  }, [cleanupListeners])

  const startGeneration = useCallback(
    async (description: string) => {
      if (!description.trim()) {
        setGenerationError('Please enter a description of the automation task')
        return
      }

      setGenerationError(null)
      setIsGenerating(true)
      setStreamingSt('')
      setStreamingIl('')
      rawBuffer.current = ''
      isActive.current = true
      ensureModelsLoaded()

      try {
        const settings = await settingsGet()
        const provider = settings.active_provider
        const model = settings.generation.model

        if (model.trim() === '') {
          setGenerationError(
            'No model selected. Please pick a model in Settings before generating code.',
          )
          setIsGenerating(false)
          isActive.current = false
          return
        }

        const apiKey = await secretGet(provider)

        if (!apiKey) {
          setGenerationError(
            `No API key found for ${provider}. Please configure your API key in Settings.`,
          )
          setIsGenerating(false)
          isActive.current = false
          return
        }

        const prompt = buildStPrompt(
          description,
          project?.io_table ?? [],
          project?.meta?.model,
        )

        const tokenUnlisten = await listen<string>('generation-token', (event) => {
          rawBuffer.current += event.payload
          setStreamingSt(rawBuffer.current)
        })

        const doneUnlisten = await listen<GenerationDonePayload>(
          'generation-done',
          (event) => {
            if (!isActive.current) return
            isActive.current = false

            let st = event.payload.stCode
            let il = event.payload.ilCode

            if ((!st || !il) && rawBuffer.current) {
              const parsed = parseGeneratedCode(rawBuffer.current)
              if (!st) st = parsed.st
              if (!il) il = parsed.il
            }

            // M3 — deterministic label injection post-processor (PRD §4.4)
            st = injectLabelComments(st, project?.io_table ?? [])

            setStreamingSt(st)
            setStreamingIl(il)
            setIsGenerating(false)

            const generated: GeneratedCode = {
              st,
              il,
              ld: event.payload.ldGraph ?? undefined,
              generated_at: new Date().toISOString(),
              model,
              prompt,
            }
            setGenerated(generated)

            const hmiInput: ProcessHmiInput = {
              rawJson: event.payload.hmiTagsRaw ?? '',
              ioTable: project?.io_table ?? [],
              maxM: resolveMaxM(),
              modelLabel: project?.meta?.model ?? null,
              previous: project?.hmi_table ?? null,
            }
            const nextHmi = processHmiFromLlm(hmiInput)
            if (nextHmi !== project?.hmi_table) {
              setHmiTable(nextHmi)
            }

            cleanupListeners()
          },
        )

        const errorUnlisten = await listen<{ message: string; kind?: string }>(
          'generation-error',
          (event) => {
            if (!isActive.current) return
            isActive.current = false

            setGenerationError(event.payload.message || 'Code generation failed')
            setIsGenerating(false)
            cleanupListeners()
          },
        )

        unlistenFns.current = [tokenUnlisten, doneUnlisten, errorUnlisten]

        const customBaseUrl =
          provider === 'custom' ? (settings.custom_base_url ?? '').trim() : ''
        const customModelName =
          provider === 'custom' ? (settings.custom_model_name ?? '').trim() : ''
        const result = await generateCode(
          prompt,
          provider,
          model,
          apiKey,
          customBaseUrl,
          customModelName,
        )
        if (result.error && isActive.current) {
          isActive.current = false
          setGenerationError(result.error)
          setIsGenerating(false)
          cleanupListeners()
        }
      } catch (err) {
        if (!isActive.current) return
        isActive.current = false
        setGenerationError(err instanceof Error ? err.message : 'Code generation failed')
        setIsGenerating(false)
        cleanupListeners()
      }
    },
    [project, setGenerated, setHmiTable, cleanupListeners, ensureModelsLoaded, resolveMaxM],
  )

  useEffect(() => {
    return () => {
      cleanupListeners()
    }
  }, [cleanupListeners])

  return {
    isGenerating,
    streamingSt,
    streamingIl,
    generationError,
    startGeneration,
    clearGeneration,
  }
}
