import { fixtureSource } from './fixture-source'
import { httpSource } from './http-source'
import type { DataSource } from './types'

export type { DataSource } from './types'
export { fixtureSource } from './fixture-source'
export { httpSource, CLIENT_ERROR_CODES } from './http-source'

/**
 * The one flag. Everything above this module talks to `dataSource` and never to
 * `fetch`, so switching to the real backend is this line and nothing else.
 */
export const dataSource: DataSource =
  process.env.NEXT_PUBLIC_TERMSPACE_DATA === 'http' ? httpSource : fixtureSource
