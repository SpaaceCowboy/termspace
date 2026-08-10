import { z } from 'zod'

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TERMSPACE_DATABASE_PATH: z.string().min(1).default('./data/termspace.db'),
  TERMSPACE_HOST: z.string().min(1).default('127.0.0.1'),
  TERMSPACE_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
})

export type Environment = z.output<typeof EnvironmentSchema>

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return EnvironmentSchema.parse(source)
}
