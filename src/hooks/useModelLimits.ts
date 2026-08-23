import { useState, useEffect, useCallback } from 'react'
import { checkModelLimits, type ModelLimitResult } from '@/lib/tauriApi'
import { useProject } from '@/hooks/useProject'

export interface UseModelLimitsResult {
  limits: ModelLimitResult | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook that runs the model-specific I/O limit check against the current
 * project's I/O table. Refreshes automatically whenever the model or
 * the I/O table changes.
 */
export function useModelLimits(): UseModelLimitsResult {
  const { project } = useProject()
  const [limits, setLimits] = useState<ModelLimitResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const model = project?.meta?.model
    if (!model) {
      setLimits(null)
      return
    }
    const ioTable = (project?.io_table ?? []).map((p) => ({
      address: p.address,
      type: p.type,
    }))
    if (ioTable.length === 0) {
      setLimits(null)
      return
    }

    setIsLoading(true)
    setError(null)
    const result = await checkModelLimits(model, ioTable)
    if (result.error) {
      setError(result.error)
      setLimits(null)
    } else {
      setLimits(result.data ?? null)
    }
    setIsLoading(false)
  }, [project])

  useEffect(() => {
    // Run the limit check whenever the project (model or I/O table)
    // changes. This is the correct way to sync external state (the
    // Tauri command result) into React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return { limits, isLoading, error, refresh }
}
