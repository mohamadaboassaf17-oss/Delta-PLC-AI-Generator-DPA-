import { useState, useEffect, useCallback, useRef } from 'react'
import { scanCodeConflicts, type ConflictReport } from '@/lib/tauriApi'
import { useProject } from '@/hooks/useProject'

export interface UseCodeConflictsResult {
  report: ConflictReport | null
  isScanning: boolean
  error: string | null
  scan: () => Promise<ConflictReport | null>
  clear: () => void
}

/**
 * Hook that runs the address-conflict scanner against the current
 * generated ST code. Refreshes when the ST code or the I/O table
 * changes.
 */
export function useCodeConflicts(): UseCodeConflictsResult {
  const { project } = useProject()
  const [report, setReport] = useState<ConflictReport | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guard against overlap of refresh + manual scan calls.
  const inFlight = useRef(false)

  const scan = useCallback(async (): Promise<ConflictReport | null> => {
    if (inFlight.current) return report
    const stCode = project?.generated?.st ?? ''
    if (!stCode.trim()) {
      setReport(null)
      return null
    }
    const ioTable = (project?.io_table ?? []).map((p) => ({
      address: p.address,
      type: p.type,
    }))
    const hmiReserved = (project?.hmi_table?.tags ?? [])
      .map((t) => t.address)
      .filter((a): a is string => typeof a === 'string' && a.length > 0)

    inFlight.current = true
    setIsScanning(true)
    setError(null)
    const result = await scanCodeConflicts({
      stCode,
      ioTable,
      hmiReserved,
    })
    inFlight.current = false
    setIsScanning(false)

    if (result.error) {
      setError(result.error)
      return null
    }
    const newReport = result.data ?? null
    setReport(newReport)
    return newReport
  }, [project, report])

  const clear = useCallback(() => {
    setReport(null)
    setError(null)
  }, [])

  useEffect(() => {
    // Run the scanner whenever the generated ST, I/O table, or HMI table
    // changes. We don't depend on `scan` itself to avoid resetting the
    // in-flight guard mid-flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.generated?.st, project?.io_table, project?.hmi_table])

  return { report, isScanning, error, scan, clear }
}
