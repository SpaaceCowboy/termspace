import { fixtureSource } from './fixture-source.ts'
import { httpSource } from './http-source.ts'
import type { DataSource } from './types.ts'

export type { DataSource } from './types.ts'
export { fixtureSource } from './fixture-source.ts'
export { httpSource, CLIENT_ERROR_CODES } from './http-source.ts'

/**
 * The one flag. Everything above this module talks to `dataSource` and never to
 * `fetch`. The phase 1 backend landed, so this now points at it by default;
 * `NEXT_PUBLIC_TERMSPACE_DATA=fixtures` puts the UI back on fixtures with no
 * gateway running.
 */
export const dataSource: DataSource =
  process.env.NEXT_PUBLIC_TERMSPACE_DATA === 'fixtures' ? fixtureSource : httpSource
