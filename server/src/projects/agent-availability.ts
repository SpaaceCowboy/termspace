import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, isAbsolute, resolve } from 'node:path'

import type { AgentAvailability, AgentCommand, AgentKind } from '@termspace/contracts'
import { DEFAULT_AGENT_COMMANDS } from '@termspace/contracts'
import { z } from 'zod'

const RuntimePathSchema = z.string().max(32_768)

export async function isAgentCommandAvailable(
  command: AgentCommand,
  cwd: string,
  runtimePath: unknown = process.env.PATH,
): Promise<boolean> {
  const executable = command[0]
  if (executable === undefined) return true

  const candidates = executable.includes('/')
    ? [isAbsolute(executable) ? executable : resolve(cwd, executable)]
    : pathCandidates(executable, runtimePath)

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return true
    } catch {
      // Keep looking through PATH. Absence is an expected capability result.
    }
  }
  return false
}

export async function defaultAgentAvailability(
  cwd: string,
  runtimePath: unknown = process.env.PATH,
): Promise<Record<AgentKind, AgentAvailability>> {
  const entries = await Promise.all(
    (Object.keys(DEFAULT_AGENT_COMMANDS) as AgentKind[]).map(async (agent) => {
      const command = DEFAULT_AGENT_COMMANDS[agent]
      return [agent, {
        available: await isAgentCommandAvailable(command, cwd, runtimePath),
        command: command[0] ?? null,
      }] as const
    }),
  )
  return Object.fromEntries(entries) as Record<AgentKind, AgentAvailability>
}

function pathCandidates(executable: string, runtimePath: unknown): readonly string[] {
  const parsed = RuntimePathSchema.safeParse(runtimePath)
  if (!parsed.success) return []
  return parsed.data
    .split(delimiter)
    .filter((directory) => directory !== '')
    .map((directory) => resolve(directory, executable))
}
