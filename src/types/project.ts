import type { HmiTable } from './hmi'
import type { IOPoint } from './io'
import type { LadderGraph } from './ladder'
import type { ChatMessage } from './chat'

export interface GeneratedCode {
  st?: string
  il?: string
  ld?: LadderGraph
  generated_at?: string
  model?: string
  prompt?: string
}

export interface Project {
  id: string
  name: string
  created_at: string
  updated_at: string
  version: 3
  meta: ProjectMeta
  io_table?: IOPoint[]
  generated?: GeneratedCode
  hmi_table?: HmiTable
  chat_history?: ChatMessage[]
}

export interface ProjectMeta {
  author?: string
  description?: string
  tags?: string[]
  model?: string
}

export interface RecentEntry {
  id: string
  name: string
  path: string
  last_opened: string
}
