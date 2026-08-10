import {
  BINARY_SID_BYTES,
  type ClientFrame,
  type ServerFrame,
} from '@termspace/contracts'
import { z } from 'zod'

const SessionIdSchema = z
  .string()
  .length(BINARY_SID_BYTES)
  .refine((value) => [...value].every((character) => character.charCodeAt(0) <= 0x7f))

const ClientFrameSchema: z.ZodType<ClientFrame> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('sub'), sid: SessionIdSchema }).strict(),
  z.object({ t: z.literal('unsub'), sid: SessionIdSchema }).strict(),
  z
    .object({
      t: z.literal('in'),
      sid: SessionIdSchema,
      data: z.string().max(65_536),
    })
    .strict(),
  z
    .object({
      t: z.literal('resize'),
      sid: SessionIdSchema,
      cols: z.number().int().min(2).max(500),
      rows: z.number().int().min(1).max(300),
    })
    .strict(),
  z
    .object({
      t: z.literal('vis'),
      sid: SessionIdSchema,
      level: z.enum(['focused', 'visible', 'hidden']),
    })
    .strict(),
  z.object({ t: z.literal('ping') }).strict(),
])

export type ClientFrameDecodeResult =
  | { readonly ok: true; readonly frame: ClientFrame }
  | { readonly ok: false; readonly reason: 'invalid_frame' | 'invalid_json' }

export function decodeClientFrame(payload: string): ClientFrameDecodeResult {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(payload)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }

  const parsedFrame = ClientFrameSchema.safeParse(parsedJson)
  if (!parsedFrame.success) {
    return { ok: false, reason: 'invalid_frame' }
  }
  return { ok: true, frame: parsedFrame.data }
}

export function encodeServerFrame(frame: ServerFrame): string {
  return JSON.stringify(frame)
}

export function encodeTerminalOutput(
  untrustedSessionId: string,
  output: string | Uint8Array,
): Buffer {
  const sessionId = SessionIdSchema.parse(untrustedSessionId)
  const header = Buffer.from(sessionId, 'ascii')
  const body = typeof output === 'string' ? Buffer.from(output, 'utf8') : Buffer.from(output)
  return Buffer.concat([header, body])
}
