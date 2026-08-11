import {
  AGENT_COMMAND_MAX_ARG_LENGTH,
  AGENT_COMMAND_MAX_ARGS,
  AGENT_KINDS,
  DEFAULT_AGENT_COMMANDS,
} from '@termspace/contracts'
import type { AgentCommand, AgentCommandOverrides, AgentKind } from '@termspace/contracts'
import { z } from 'zod'

/**
 * A launch command is argv and is executed without a shell, so there is no
 * metacharacter to escape here — the bounds exist to stop a stored override
 * growing without limit, not to sanitise it.
 *
 * An argument may not be empty and may not contain a NUL: `execve` truncates at
 * a NUL, so allowing one would let the stored command and the executed command
 * differ, which is the one thing this validation has to prevent.
 */
const ArgumentSchema = z
  .string()
  .min(1)
  .max(AGENT_COMMAND_MAX_ARG_LENGTH)
  .refine((value) => !value.includes('\0'), {
    message: 'An argument may not contain a NUL byte',
  })

export const AgentCommandSchema = z.array(ArgumentSchema).max(AGENT_COMMAND_MAX_ARGS)

/**
 * Strict on purpose. zod strips unknown keys by default, which would silently
 * discard a misspelled agent kind and leave the user staring at a project that
 * accepted their config and ignored it.
 */
const RawOverridesSchema = z
  .object(Object.fromEntries(AGENT_KINDS.map((kind) => [kind, AgentCommandSchema.optional()])))
  .strict()

/**
 * `exactOptionalPropertyTypes` makes an explicitly-`undefined` key a different
 * type from an absent one, and zod's output carries the former. Rebuilding
 * through a conditional spread is what turns one into the other.
 */
function compact(raw: Record<string, readonly string[] | undefined>): AgentCommandOverrides {
  let overrides: AgentCommandOverrides = {}
  for (const kind of AGENT_KINDS) {
    const command = raw[kind]
    overrides = command === undefined ? overrides : { ...overrides, [kind]: command }
  }
  return overrides
}

export function parseAgentCommandOverrides(untrusted: unknown): AgentCommandOverrides {
  return compact(RawOverridesSchema.parse(untrusted))
}

/**
 * Reading is deliberately lenient about *shape* but not about *content*: a row
 * written by an older server, or hand-edited, must not take the whole project
 * list down. An unreadable override falls back to the default, which is the
 * same thing an absent one does.
 */
export function parseAgentCommands(raw: string): AgentCommandOverrides {
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = RawOverridesSchema.safeParse(parsed)
    return result.success ? compact(result.data) : {}
  } catch {
    return {}
  }
}

export function serializeAgentCommands(overrides: AgentCommandOverrides): string {
  return JSON.stringify(compact(RawOverridesSchema.parse(overrides)))
}

/**
 * What a session of this kind actually launches. An empty argv means no command
 * at all, which is how tmux is told to start the plain login shell.
 */
export function resolveAgentCommand(
  agent: AgentKind,
  overrides: AgentCommandOverrides,
): AgentCommand {
  return overrides[agent] ?? DEFAULT_AGENT_COMMANDS[agent]
}
