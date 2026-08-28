import { useCallback, useEffect, useState } from 'react'
import { safeInvoke, projectListRecent } from '@/lib/tauriApi'
import type { RecentEntry } from '@/types/project'

export const RECENTS_REFRESH_EVENT = 'dpa:recents:refresh'

export interface UseRecentProjectsResult {
  recents: RecentEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  remove: (path: string) => Promise<void>
}

export function useRecentProjects(): UseRecentProjectsResult {
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    // Prefer canonical `recent_projects_list`; fallback to legacy alias inside safeInvoke
    const result = await safeInvoke<RecentEntry[]>('recent_projects_list')
    if (result.error || !result.data) {
      // Fallback to legacy name if canonical not yet registered (old build)
      const fallback = await safeInvoke<RecentEntry[]>('project_list_recent')
      if (fallback.error || !fallback.data) {
        setError(fallback.error ?? result.error ?? 'Failed to load recents')
        setRecents([])
      } else {
        setRecents(fallback.data)
      }
    } else {
      setRecents(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial recents load
    void refresh()
  }, [refresh])

  // Global refresh bus for FIX-02: save/save-as/open/close trigger this event
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (): void => {
      void refresh()
    }
    window.addEventListener(RECENTS_REFRESH_EVENT, handler)
    return () => window.removeEventListener(RECENTS_REFRESH_EVENT, handler)
  }, [refresh])

  const remove = useCallback(async (path: string): Promise<void> => {
    const result = await safeInvoke<void>('recent_projects_remove', { path })
    if (result.error) {
      // Fallback to local filter so UI stays responsive even if backend not yet updated
      setRecents((prev) => prev.filter((r) => r.path !== path))
      return
    }
    // Re-fetch from disk so removal is persisted and survives remount
    await refresh()
  }, [refresh])

  return { recents, loading, error, refresh, remove }
}

export function emitRecentsRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(RECENTS_REFRESH_EVENT))
}

export { projectListRecent }
