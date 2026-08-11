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

/**
 * Either adopt a directory that is already on the box (`path`) or clone
 * `repoUrl` into it. Exactly one of the two must say where the code comes from:
 * with no `repoUrl` the path must already exist, and with one it must not.
 */
export interface CreateProjectInput {
  name: string
  path: string
  repoUrl?: string
  defaultBranch?: string
  setupCommand?: string
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

export interface CreateSessionInput {
  projectId: string
  name: string
  agent: AgentKind
  cwd?: string
}

export const AGENT_KINDS = ['claude', 'codex', 'shell'] as const
