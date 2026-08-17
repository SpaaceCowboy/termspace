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
    TERMSPACE_TMUX_SOCKET_NAME: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('default'),
    TERMSPACE_TMUX_SOCKET_PATH: z
      .string()
      .min(1)
      .refine((value) => value.startsWith('/'), 'Must be an absolute path')
      .refine((value) => !value.includes('\0'), 'Must not contain a null byte')
      .optional(),
    TERMSPACE_SYSTEMD_SESSION_SCOPES: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TERMSPACE_SESSION_MEMORY_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(64 * 1_024 * 1_024)
      .max(1_024 * 1_024 * 1_024 * 1_024)
      .default(4 * 1_024 * 1_024 * 1_024),
    TERMSPACE_SESSION_SHELL: z
      .string()
      .min(1)
      .refine((value) => value.startsWith('/'), 'Must be an absolute path')
      .default('/bin/bash'),
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
    /**
     * Web Push is optional. Both keys must be present or push is simply off —
     * a half-configured pair is a mistake worth refusing, since the symptom
     * otherwise is notifications that silently never arrive.
     */
    TERMSPACE_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    TERMSPACE_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    TERMSPACE_VAPID_SUBJECT: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith('mailto:') || value.startsWith('https://'),
        'Must be a mailto: or https: URL',
      )
      .optional(),
  })
  .superRefine((environment, context) => {
    const hasPublic = environment.TERMSPACE_VAPID_PUBLIC_KEY !== undefined
    const hasPrivate = environment.TERMSPACE_VAPID_PRIVATE_KEY !== undefined
    if (hasPublic !== hasPrivate) {
      context.addIssue({
        code: 'custom',
        message:
          'TERMSPACE_VAPID_PUBLIC_KEY and TERMSPACE_VAPID_PRIVATE_KEY must be set together',
        path: [hasPublic ? 'TERMSPACE_VAPID_PRIVATE_KEY' : 'TERMSPACE_VAPID_PUBLIC_KEY'],
      })
    }
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
