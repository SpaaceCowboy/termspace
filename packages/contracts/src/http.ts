export interface ApiError {
  code: string
  message: string
  field?: string
}

export interface ApiOk<T> {
  ok: true
  data: T
}

export interface ApiErr {
  ok: false
  error: ApiError
}

export type ApiResponse<T> = ApiOk<T> | ApiErr

export interface HealthData {
  version: string
}

/**
 * Server settings the UI has to know to build a valid request. `projectRoot` is
 * where every project directory must live, so the new-project form can prefill
 * it instead of making you guess and read the error. Authenticated: it is a
 * filesystem path.
 */
export interface AppConfig {
  projectRoot: string
}

export function isApiOk<T>(response: ApiResponse<T>): response is ApiOk<T> {
  return response.ok
}
