import {
  healthDataFixture,
  projectFixtures,
  sessionFixtures,
  type ApiResponse,
  type HealthData,
  type Project,
  type Session,
} from '@termspace/contracts'

import type { DataSource } from './types'

function ok<T>(data: T): Promise<ApiResponse<T>> {
  return Promise.resolve({ ok: true, data })
}

export const fixtureSource: DataSource = {
  kind: 'fixtures',
  health(): Promise<ApiResponse<HealthData>> {
    return ok(healthDataFixture)
  },
  listProjects(): Promise<ApiResponse<Project[]>> {
    return ok([...projectFixtures])
  },
  listSessions(): Promise<ApiResponse<Session[]>> {
    return ok([...sessionFixtures])
  },
}
