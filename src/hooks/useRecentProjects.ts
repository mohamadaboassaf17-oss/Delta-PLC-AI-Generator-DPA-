import { useCallback, useEffect, useState } from 'react'
import { safeInvoke, projectListRecent } from '@/lib/tauriApi'
import type { RecentEntry } from '@/types/project'

export interface UseRecentProjectsResult {
  recents: RecentEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  remove: (path: string) => void
}

export function useRecentProjects(): UseRecentProjectsResult {
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const result = await safeInvoke<RecentEntry[]>('project_list_recent')
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to load recents')
      setRecents([])
    } else {
      setRecents(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial recents load
    void refresh()
  }, [refresh])

  const remove = useCallback((path: string): void => {
    setRecents((prev) => prev.filter((r) => r.path !== path))
  }, [])

  return { recents, loading, error, refresh, remove }
}

export { projectListRecent }
