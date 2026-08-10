import type { SessionState } from './transport.js'

export interface Project {
  id: string
  slug: string
  name: string
  path: string
  repoUrl: string | null
  defaultBranch: string
  setupCommand: string | null
  createdAt: number
}

export type AgentKind = 'claude' | 'codex' | 'shell'

export interface Session {
  id: string
  projectId: string
  name: string
  agent: AgentKind
  cwd: string
  worktreeBranch: string | null
  state: SessionState
  title: string | null
  lastActivityAt: number
  createdAt: number
}

export const AGENT_KINDS = ['claude', 'codex', 'shell'] as const
