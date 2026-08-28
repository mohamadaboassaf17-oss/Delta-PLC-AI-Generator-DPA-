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
  // Use the canonical `settings_has_api_key` alias (AGENTS.md:85) — verifies
  // key presence via the OS keychain for all four providers (FIX-03).
  return Promise.all([
    safeInvoke<boolean>('settings_has_api_key', { provider: 'openai' }),
    safeInvoke<boolean>('settings_has_api_key', { provider: 'anthropic' }),
    safeInvoke<boolean>('settings_has_api_key', { provider: 'gemini' }),
    safeInvoke<boolean>('settings_has_api_key', { provider: 'custom' }),
  ])
    .then(([openai, anthropic, gemini, custom]) => {
      return Boolean(openai.data ?? anthropic.data ?? gemini.data ?? custom.data)
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

  // M10.1 — deep-link: missing-key error banners dispatch `dpa:open-settings`
  // so the user reaches Settings/Wizard in one click (no dead-end).
  useEffect(() => {
    const handler = (): void => setSettingsOpen(true)
    window.addEventListener('dpa:open-settings', handler as EventListener)
    return () => window.removeEventListener('dpa:open-settings', handler as EventListener)
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
