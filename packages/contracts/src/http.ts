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
  /**
   * False when the server cannot write to `projectRoot` — it is missing and
   * could not be created, or it is not writable by the app user. Every project
   * creation will fail until that is fixed, so the UI says so up front rather
   * than after a submit.
   */
  projectRootWritable: boolean
}

export function isApiOk<T>(response: ApiResponse<T>): response is ApiOk<T> {
  return response.ok
}
