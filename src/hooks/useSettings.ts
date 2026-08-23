import { useCallback, useEffect, useState } from 'react'
import { safeInvoke, settingsGet, settingsSet } from '@/lib/tauriApi'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'

export interface UseSettingsResult {
  settings: Settings
  loading: boolean
  error: string | null
  setSettings: (next: Settings) => Promise<void>
  reload: () => Promise<void>
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const result = await safeInvoke<Settings>('settings_get')
    if (result.error) {
      setError(result.error)
      setSettingsState(DEFAULT_SETTINGS)
    } else if (result.data) {
      setSettingsState(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial settings load
    void reload()
  }, [reload])

  const setSettings = useCallback(async (next: Settings): Promise<void> => {
    setSettingsState(next)
    const result = await safeInvoke<void>('settings_set', { settings: next })
    if (result.error) {
      setError(result.error)
      throw new Error(result.error)
    }
    setError(null)
  }, [])

  return { settings, loading, error, setSettings, reload }
}

export { settingsGet, settingsSet }
