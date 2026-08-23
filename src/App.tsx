import type { ReactElement } from 'react'
import { AppShell } from '@/components/AppShell/AppShell'
import { ProjectProvider } from '@/context/ProjectContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/Toast'

export default function App(): ReactElement {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ProjectProvider>
          <AppShell />
        </ProjectProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
