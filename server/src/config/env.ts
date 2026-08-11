import { z } from 'zod'

const ConfiguredOriginSchema = z.url().refine((value) => {
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
})

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TERMSPACE_ALLOWED_ORIGIN: ConfiguredOriginSchema.optional(),
    TERMSPACE_AUTH_SESSION_TTL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(8 * 60 * 60 * 1_000),
    TERMSPACE_DATABASE_PATH: z.string().min(1).default('./data/termspace.db'),
    TERMSPACE_HOST: z.string().min(1).default('127.0.0.1'),
    TERMSPACE_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    /**
     * Every project directory lives under this. Not a jail — a session is a real
     * shell and can leave it — but it bounds accidental agent damage, and it is
     * what lets the systemd unit declare a single `ReadWritePaths`.
     */
    TERMSPACE_PROJECT_ROOT: z
      .string()
      .min(1)
      .refine((value) => value.startsWith('/'), 'Must be an absolute path')
      .refine((value) => !value.includes('\0'), 'Must not contain a null byte')
      .default('/srv/projects'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.TERMSPACE_ALLOWED_ORIGIN === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'TERMSPACE_ALLOWED_ORIGIN is required in production',
        path: ['TERMSPACE_ALLOWED_ORIGIN'],
      })
    }
  })
  .transform((environment) => ({
    ...environment,
    /**
     * The dev default has to match what `web` actually serves on, or every
     * WebSocket upgrade is rejected with a bare 403 and nothing says why. That
     * package defaults to `PORT=3002`; keep the two in step.
     */
    TERMSPACE_ALLOWED_ORIGIN:
      environment.TERMSPACE_ALLOWED_ORIGIN ?? 'http://localhost:3002',
  }))

export type Environment = z.output<typeof EnvironmentSchema>

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return EnvironmentSchema.parse(source)
}
