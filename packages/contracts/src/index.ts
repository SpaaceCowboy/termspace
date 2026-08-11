export type {
  ClientFrame,
  ClientFrameKind,
  ServerFrame,
  ServerFrameKind,
  SessionState,
  VisibilityLevel,
} from './transport.js'
export { BINARY_SID_BYTES, SESSION_STATES, VISIBILITY_LEVELS } from './transport.js'

export type {
  AgentCommand,
  AgentCommandOverrides,
  AgentKind,
  CreateProjectInput,
  CreateSessionInput,
  Project,
  Session,
  UpdateProjectInput,
} from './core.js'
export {
  AGENT_COMMAND_MAX_ARG_LENGTH,
  AGENT_COMMAND_MAX_ARGS,
  AGENT_KINDS,
  DEFAULT_AGENT_COMMANDS,
} from './core.js'

export type { Layout, LayoutInput, LayoutMode, NormalizeLayoutOptions } from './layout.js'
export {
  EMPTY_LAYOUT,
  LAYOUT_MAX_SLOTS,
  LAYOUT_MODES,
  LAYOUT_SLOT_CAPACITY,
  layoutSlotIndices,
  normalizeLayout,
} from './layout.js'

export type { LoginInput, User, WsTicket } from './auth.js'

export type { ErrorCode } from './errors.js'
export { CLIENT_ERROR_PREFIX, ERROR_CODES, isErrorCode } from './errors.js'

export type { ApiErr, ApiError, ApiOk, ApiResponse, AppConfig, HealthData } from './http.js'
export { isApiOk } from './http.js'

export * from './fixtures.js'
