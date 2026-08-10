import { z } from 'zod'

const OriginSchema = z
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return value === url.origin
    } catch {
      return false
    }
  })

export function isAllowedOrigin(
  untrustedOrigin: unknown,
  configuredOrigin: string,
): boolean {
  const origin = OriginSchema.safeParse(untrustedOrigin)
  const allowedOrigin = OriginSchema.parse(configuredOrigin)
  return origin.success && origin.data === allowedOrigin
}
