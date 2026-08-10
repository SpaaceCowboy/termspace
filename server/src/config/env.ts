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
    TERMSPACE_ALLOWED_ORIGIN:
      environment.TERMSPACE_ALLOWED_ORIGIN ?? 'http://localhost:3000',
  }))

export type Environment = z.output<typeof EnvironmentSchema>

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return EnvironmentSchema.parse(source)
}
