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
 * Where a project's code comes from. Exactly one of three:
 *
 * - adopt a directory already on the box — no `repoUrl`, the path must exist
 * - clone `repoUrl` into it — the path must not exist
 * - start empty — `createDirectory`, and the server makes the directory
 *
 * `createDirectory` and `repoUrl` are mutually exclusive: a clone makes the
 * directory itself, and asking for both says nothing coherent about what should
 * end up on disk.
 */
export interface CreateProjectInput {
  name: string
  path: string
  repoUrl?: string
  createDirectory?: boolean
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
