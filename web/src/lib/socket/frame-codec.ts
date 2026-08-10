import { BINARY_SID_BYTES, type ClientFrame, type ServerFrame } from '@termspace/contracts'
import { z } from 'zod'

/** Mirrors the bounds in `server/src/ws/frame-codec.ts`. A frame outside them is dropped. */
export const FRAME_LIMITS = {
  inputBytes: 65_536,
  minCols: 2,
  maxCols: 500,
  minRows: 1,
  maxRows: 300,
} as const

const SessionIdSchema = z
  .string()
  .length(BINARY_SID_BYTES)
  .refine((value) => [...value].every((character) => character.charCodeAt(0) <= 0x7f))

const ServerFrameSchema: z.ZodType<ServerFrame> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('restore'), sid: SessionIdSchema, data: z.string() }).strict(),
  z
    .object({
      t: z.literal('status'),
      sid: SessionIdSchema,
      state: z.enum(['working', 'idle', 'needs-you', 'dead']),
      since: z.number(),
    })
    .strict(),
  z.object({ t: z.literal('title'), sid: SessionIdSchema, title: z.string() }).strict(),
  z
    .object({ t: z.literal('exit'), sid: SessionIdSchema, code: z.number().nullable() })
    .strict(),
  z.object({ t: z.literal('truncated'), sid: SessionIdSchema }).strict(),
  z
    .object({
      t: z.literal('error'),
      sid: SessionIdSchema.nullable(),
      code: z.string(),
      message: z.string(),
    })
    .strict(),
  z.object({ t: z.literal('pong') }).strict(),
])

export type ServerFrameDecodeResult =
  | { readonly ok: true; readonly frame: ServerFrame }
  | { readonly ok: false; readonly reason: 'invalid_json' | 'invalid_frame' }

export function decodeServerFrame(payload: string): ServerFrameDecodeResult {
  let json: unknown
  try {
    json = JSON.parse(payload)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }

  const parsed = ServerFrameSchema.safeParse(json)
  return parsed.success
    ? { ok: true, frame: parsed.data }
    : { ok: false, reason: 'invalid_frame' }
}

export function encodeClientFrame(frame: ClientFrame): string {
  return JSON.stringify(frame)
}

export interface TerminalOutput {
  readonly sid: string
  readonly bytes: Uint8Array
}

/**
 * The payload stays raw bytes rather than a string: a UTF-8 sequence can be
 * split across two frames, and xterm's own decoder stitches those back together.
 * Decoding to a string here would turn the split into a replacement character.
 */
export function decodeTerminalOutput(frame: ArrayBuffer | Uint8Array): TerminalOutput | null {
  const view = frame instanceof Uint8Array ? frame : new Uint8Array(frame)
  if (view.length < BINARY_SID_BYTES) {
    return null
  }

  const header = view.subarray(0, BINARY_SID_BYTES)
  for (const byte of header) {
    if (byte > 0x7f) {
      return null
    }
  }

  return {
    sid: String.fromCharCode(...header),
    bytes: view.subarray(BINARY_SID_BYTES),
  }
}

export function clampResize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: clampInt(cols, FRAME_LIMITS.minCols, FRAME_LIMITS.maxCols),
    rows: clampInt(rows, FRAME_LIMITS.minRows, FRAME_LIMITS.maxRows),
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

/** Splits oversized input so no `in` frame exceeds what the server accepts. */
export function chunkInput(data: string): string[] {
  if (data.length <= FRAME_LIMITS.inputBytes) {
    return [data]
  }
  const chunks: string[] = []
  for (let index = 0; index < data.length; index += FRAME_LIMITS.inputBytes) {
    chunks.push(data.slice(index, index + FRAME_LIMITS.inputBytes))
  }
  return chunks
}
