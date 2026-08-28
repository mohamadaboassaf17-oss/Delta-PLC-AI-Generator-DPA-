/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useReducer, type ReactElement, type ReactNode } from 'react'
import { safeInvoke, projectClearActive as apiProjectClearActive } from '@/lib/tauriApi'
import { emitRecentsRefresh } from '@/hooks/useRecentProjects'
import type { Project, GeneratedCode } from '@/types/project'
import type { IOPoint } from '@/types/io'
import type { HmiTable } from '@/types/hmi'
import type { ChatMessage } from '@/types/chat'

// Ensure saved paths always end in `.dpa` (mirrors Rust `ensure_dpa_extension`)
function ensureDpaExtension(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '') return trimmed
  const lower = trimmed.toLowerCase()
  if (lower.endsWith('.dpa')) return trimmed
  // If path has different extension, replace it
  const dot = trimmed.lastIndexOf('.')
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (dot > slash) return `${trimmed.slice(0, dot)}.dpa`
  return `${trimmed}.dpa`
}

export type ProjectStatus = 'idle' | 'new' | 'opened' | 'dirty' | 'saving' | 'error'

interface ProjectState {
  project: Project | null
  status: ProjectStatus
  error: string | null
  path: string | null
  chatHistory: ChatMessage[]
}

type Action =
  | { type: 'start_saving' }
  | { type: 'set_project'; project: Project; status: ProjectStatus; path: string | null }
  | { type: 'mark_dirty' }
  | { type: 'set_error'; error: string }
  | { type: 'clear' }
  | { type: 'reset_error' }
  | { type: 'set_project_model'; model: string }
  | { type: 'set_io_table'; ioTable: IOPoint[] }
  | { type: 'set_hmi_table'; hmiTable: HmiTable }
  | { type: 'SET_GENERATED'; generated: GeneratedCode }
  | { type: 'set_chat_history'; history: ChatMessage[] }
  | { type: 'add_chat_message'; message: ChatMessage }

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'start_saving':
      return { ...state, status: 'saving', error: null }
    case 'set_project':
      return {
        project: action.project,
        status: action.status,
        path: action.path,
        error: null,
        chatHistory: action.project.chat_history ?? [],
      }
    case 'mark_dirty':
      if (state.project === null) return state
      return { ...state, status: 'dirty', error: null }
    case 'set_error':
      return { ...state, status: 'error', error: action.error }
    case 'clear':
      return { project: null, status: 'idle', error: null, path: null, chatHistory: [] }
    case 'reset_error':
      return { ...state, error: null }
    case 'set_project_model':
      if (state.project === null) return state
      return {
        ...state,
        status: 'dirty',
        error: null,
        project: {
          ...state.project,
          meta: { ...state.project.meta, model: action.model },
        },
      }
    case 'set_io_table':
      if (state.project === null) return state
      return {
        ...state,
        status: 'dirty',
        error: null,
        project: { ...state.project, io_table: action.ioTable },
      }
    case 'set_hmi_table':
      if (state.project === null) return state
      return {
        ...state,
        status: 'dirty',
        error: null,
        project: { ...state.project, hmi_table: action.hmiTable },
      }
    case 'SET_GENERATED':
      if (!state.project) return state
      return {
        ...state,
        project: { ...state.project, generated: action.generated },
        status: 'dirty' as const,
      }
    case 'set_chat_history':
      if (!state.project) return state
      return {
        ...state,
        chatHistory: action.history,
        project: { ...state.project, chat_history: action.history },
        status: 'dirty' as const,
      }
    case 'add_chat_message': {
      if (!state.project) return state
      const newHistory = [...state.chatHistory, action.message]
      return {
        ...state,
        chatHistory: newHistory,
        project: { ...state.project, chat_history: newHistory },
        status: 'dirty' as const,
      }
    }
    default:
      return state
  }
}

const initial: ProjectState = {
  project: null,
  status: 'idle',
  error: null,
  path: null,
  chatHistory: [],
}

export interface ProjectContextValue {
  project: Project | null
  status: ProjectStatus
  error: string | null
  path: string | null
  isDirty: boolean
  chatHistory: ChatMessage[]
  createNew: (name: string) => Promise<void>
  openExisting: (path: string) => Promise<void>
  save: () => Promise<void>
  saveAs: (path: string) => Promise<void>
  markDirty: () => void
  setProjectModel: (model: string) => void
  setIoTable: (ioTable: IOPoint[]) => void
  setHmiTable: (hmiTable: HmiTable) => void
  setGenerated: (generated: GeneratedCode) => void
  setChatHistory: (history: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  close: () => void
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

export interface ProjectProviderProps {
  children: ReactNode
}

export function ProjectProvider({ children }: ProjectProviderProps): ReactElement {
  const [state, dispatch] = useReducer(reducer, initial)

  const createNew = async (name: string): Promise<void> => {
    dispatch({ type: 'start_saving' })
    const result = await safeInvoke<Project>('project_new', { name })
    if (result.error || !result.data) {
      dispatch({ type: 'set_error', error: result.error ?? 'Failed to create project' })
      return
    }
    dispatch({ type: 'set_project', project: result.data, status: 'new', path: null })
  }

  const openExisting = async (path: string): Promise<void> => {
    dispatch({ type: 'start_saving' })
    const result = await safeInvoke<Project>('project_open', { path })
    if (result.error || !result.data) {
      dispatch({ type: 'set_error', error: result.error ?? 'Failed to open project' })
      return
    }
    dispatch({ type: 'set_project', project: result.data, status: 'opened', path })
    // FIX-02: backend bumps MRU on open — notify the recents bus
    emitRecentsRefresh()
  }

  const save = async (): Promise<void> => {
    if (!state.project) {
      dispatch({ type: 'set_error', error: 'No project to save' })
      return
    }
    if (!state.path) {
      dispatch({ type: 'set_error', error: 'No path; use Save As… first' })
      return
    }
    dispatch({ type: 'start_saving' })
    const result = await safeInvoke<void>('project_save', { project: state.project })
    if (result.error) {
      dispatch({ type: 'set_error', error: result.error })
      return
    }
    dispatch({
      type: 'set_project',
      project: state.project,
      status: 'opened',
      path: state.path,
    })
    emitRecentsRefresh()
  }

  const saveAs = async (path: string): Promise<void> => {
    if (!state.project) {
      dispatch({ type: 'set_error', error: 'No project to save' })
      return
    }
    dispatch({ type: 'start_saving' })
    const normalized = ensureDpaExtension(path)
    const result = await safeInvoke<void>('project_save_as', {
      project: state.project,
      path: normalized,
    })
    if (result.error) {
      dispatch({ type: 'set_error', error: result.error })
      return
    }
    dispatch({
      type: 'set_project',
      project: state.project,
      status: 'opened',
      path: normalized,
    })
    emitRecentsRefresh()
  }

  const markDirty = (): void => {
    dispatch({ type: 'mark_dirty' })
  }

  const close = (): void => {
    void apiProjectClearActive()
    dispatch({ type: 'clear' })
    emitRecentsRefresh()
  }

  const setGenerated = useCallback((generated: GeneratedCode) => {
    dispatch({ type: 'SET_GENERATED', generated })
  }, [])

  const setChatHistory = useCallback((history: ChatMessage[]) => {
    dispatch({ type: 'set_chat_history', history })
  }, [])

  const addChatMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: 'add_chat_message', message })
  }, [])

  const value: ProjectContextValue = {
    project: state.project,
    status: state.status,
    error: state.error,
    path: state.path,
    isDirty: state.status === 'dirty',
    chatHistory: state.chatHistory,
    createNew,
    openExisting,
    save,
    saveAs,
    markDirty,
    setProjectModel: (model: string) => dispatch({ type: 'set_project_model', model }),
    setIoTable: (ioTable: IOPoint[]) => dispatch({ type: 'set_io_table', ioTable }),
    setHmiTable: (hmiTable: HmiTable) => dispatch({ type: 'set_hmi_table', hmiTable }),
    setGenerated,
    setChatHistory,
    addChatMessage,
    close,
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProjectContextValue(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProjectContextValue must be used inside <ProjectProvider>')
  }
  return ctx
}
