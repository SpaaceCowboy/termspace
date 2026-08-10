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

export function isApiOk<T>(response: ApiResponse<T>): response is ApiOk<T> {
  return response.ok
}
