import type { SessionState } from './transport.js'

export interface Project {
  id: string
  slug: string
  name: string
  path: string
  repoUrl: string | null
  defaultBranch: string
  setupCommand: string | null
  /** Per-agent launch overrides. An absent kind uses the server default. */
  agentCommands: AgentCommandOverrides
  createdAt: number
}

/**
 * A launch command is argv, never a shell string. tmux is executed through
 * `spawn` with an argument vector and no shell, so keeping this an array means
 * there is no quoting layer to get wrong and no metacharacter to escape — a
 * flag is just another element.
 *
 * An empty array is meaningful and distinct from an absent key: it means "start
 * this agent's pane with the plain login shell", which is what `shell` is.
 */
export type AgentCommand = readonly string[]

export type AgentCommandOverrides = Partial<Record<AgentKind, AgentCommand>>

/** Bounds, so a stored override cannot become an unbounded argv. */
export const AGENT_COMMAND_MAX_ARGS = 32
export const AGENT_COMMAND_MAX_ARG_LENGTH = 512

/**
 * What each kind launches with nothing configured. `shell` is empty on purpose:
 * tmux with no command starts the user's login shell, which is the whole point
 * of that kind.
 */
export const DEFAULT_AGENT_COMMANDS: Record<AgentKind, AgentCommand> = {
  claude: ['claude'],
  codex: ['codex'],
  shell: [],
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
  agentCommands?: AgentCommandOverrides
}

/** Everything a project exposes for editing after it exists. */
export interface UpdateProjectInput {
  agentCommands?: AgentCommandOverrides
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
