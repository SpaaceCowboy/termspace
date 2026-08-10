import type {
  ApiResponse,
  CreateSessionInput,
  HealthData,
  LoginInput,
  Project,
  Session,
  User,
  WsTicket,
} from '@termspace/contracts'

export type Empty = Record<string, never>

export interface DataSource {
  readonly kind: 'fixtures' | 'http'
  health(signal?: AbortSignal): Promise<ApiResponse<HealthData>>
  listProjects(signal?: AbortSignal): Promise<ApiResponse<Project[]>>
  listSessions(signal?: AbortSignal): Promise<ApiResponse<Session[]>>
  login(input: LoginInput, signal?: AbortSignal): Promise<ApiResponse<{ user: User }>>
  logout(signal?: AbortSignal): Promise<ApiResponse<Empty>>
  me(signal?: AbortSignal): Promise<ApiResponse<{ user: User }>>
  wsTicket(signal?: AbortSignal): Promise<ApiResponse<WsTicket>>
  createSession(
    input: CreateSessionInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Session>>
  deleteSession(sessionId: string, signal?: AbortSignal): Promise<ApiResponse<Empty>>
}
