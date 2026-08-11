import type {
  ApiResponse,
  AppConfig,
  CreateProjectInput,
  CreateSessionInput,
  HealthData,
  Layout,
  LayoutInput,
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
  config(signal?: AbortSignal): Promise<ApiResponse<AppConfig>>
  listProjects(signal?: AbortSignal): Promise<ApiResponse<Project[]>>
  createProject(
    input: CreateProjectInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Project>>
  deleteProject(projectId: string, signal?: AbortSignal): Promise<ApiResponse<Empty>>
  listSessions(signal?: AbortSignal): Promise<ApiResponse<Session[]>>
  layout(signal?: AbortSignal): Promise<ApiResponse<Layout>>
  saveLayout(input: LayoutInput, signal?: AbortSignal): Promise<ApiResponse<Layout>>
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
