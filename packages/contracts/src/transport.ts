export type SessionState = 'working' | 'idle' | 'needs-you' | 'dead'

export type VisibilityLevel = 'focused' | 'visible' | 'hidden'

export type ClientFrame =
  | { t: 'sub'; sid: string }
  | { t: 'unsub'; sid: string }
  | { t: 'in'; sid: string; data: string }
  | { t: 'resize'; sid: string; cols: number; rows: number }
  | { t: 'vis'; sid: string; level: VisibilityLevel }
  | { t: 'ping' }

export type ServerFrame =
  | { t: 'restore'; sid: string; data: string }
  | { t: 'status'; sid: string; state: SessionState; since: number }
  | { t: 'title'; sid: string; title: string }
  | { t: 'exit'; sid: string; code: number | null }
  | { t: 'truncated'; sid: string }
  | { t: 'error'; sid: string | null; code: string; message: string }
  | { t: 'pong' }

export type ClientFrameKind = ClientFrame['t']
export type ServerFrameKind = ServerFrame['t']

export const SESSION_STATES = ['working', 'idle', 'needs-you', 'dead'] as const

export const VISIBILITY_LEVELS = ['focused', 'visible', 'hidden'] as const

/**
 * Terminal output is not a JSON frame. It arrives as a binary frame whose first
 * 16 bytes are the ASCII session id, right-padded, followed by the raw bytes.
 */
export const BINARY_SID_BYTES = 16
