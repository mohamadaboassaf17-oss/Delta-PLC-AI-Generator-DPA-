import { useEffect, useState, type ReactElement } from 'react'
import { useProject } from '@/hooks/useProject'
import { useSettings } from '@/hooks/useSettings'
import { useAutoSaveOnOffline } from '@/hooks/useAutoSaveOnOffline'
import { SettingsPanel } from '@/components/SettingsPanel'
import { StatusBar } from '@/components/StatusBar'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { ByokWizard } from '@/components/ByokWizard'
import { ProjectLayout } from './ProjectLayout'
import { safeInvoke } from '@/lib/tauriApi'

const ONBOARDED_KEY = 'dpa.onboarded'

function isOnboarded(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true
  }
}

function hasAnyKey(): Promise<boolean> {
  return Promise.all([safeInvoke<string | null>('secret_get', { provider: 'openai' })])
    .then(async ([openai]) => {
      if (openai.data) return true
      const anthropic = await safeInvoke<string | null>('secret_get', { provider: 'anthropic' })
      if (anthropic.data) return true
      return false
    })
    .catch(() => false)
}

export function AppShell(): ReactElement {
  const { project } = useProject()
  const { reload: reloadSettings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [byokOpen, setByokOpen] = useState<boolean>(false)

  useAutoSaveOnOffline()

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  useEffect(() => {
    if (isOnboarded()) return
    void hasAnyKey().then((has) => {
      if (!has) setByokOpen(true)
    })
  }, [])

  const handleByokComplete = (): void => {
    setByokOpen(false)
  }

  const handleByokSkip = (): void => {
    setByokOpen(false)
  }

  if (project) {
    return (
      <div className="flex h-full flex-col">
        <ProjectLayout />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <ByokWizard
          open={byokOpen}
          onComplete={handleByokComplete}
          onSkip={handleByokSkip}
        />
        <StatusBar />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <WelcomeScreen onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ByokWizard
        open={byokOpen}
        onComplete={handleByokComplete}
        onSkip={handleByokSkip}
      />
      <StatusBar />
    </div>
  )
}
