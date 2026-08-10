import type { ApiResponse, HealthData, Project, Session } from '@termspace/contracts'

export interface DataSource {
  readonly kind: 'fixtures' | 'http'
  health(signal?: AbortSignal): Promise<ApiResponse<HealthData>>
  listProjects(signal?: AbortSignal): Promise<ApiResponse<Project[]>>
  listSessions(signal?: AbortSignal): Promise<ApiResponse<Session[]>>
}
