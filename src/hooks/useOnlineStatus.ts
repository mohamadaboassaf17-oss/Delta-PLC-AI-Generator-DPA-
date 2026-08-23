import { useEffect, useState } from 'react'

export interface UseOnlineStatusResult {
  isOnline: boolean
}

/**
 * Read the current online/offline status from the browser and subscribe to
 * `window` `online`/`offline` events.
 *
 * The hook defaults to `true` in non-browser environments (SSR, Node tests
 * without a `navigator` global) so that no feature is accidentally gated off.
 */
export function useOnlineStatus(): UseOnlineStatusResult {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true
    if (typeof navigator.onLine !== 'boolean') return true
    return navigator.onLine
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = (): void => setIsOnline(true)
    const handleOffline = (): void => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline }
}
