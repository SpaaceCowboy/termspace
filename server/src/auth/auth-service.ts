import { verify as verifyPassword } from 'argon2'
import { verify as verifyTotp } from 'otplib'

import type { UserCredentials } from './user-repository.js'

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$2hoqnWzLGXn2QEf+o0276A$qWf0onZXIlt0B1udtizGZwt28vLcN6Yvxxzg14UT6Fs'

interface UserCredentialsReader {
  findCredentialsByUsername(username: string): UserCredentials | null
}

export class AuthService {
  readonly #users: UserCredentialsReader

  constructor(users: UserCredentialsReader) {
    this.#users = users
  }

  async authenticate(
    username: string,
    password: string,
    totp: string,
    epochSeconds: number = Math.floor(Date.now() / 1_000),
  ): Promise<string | null> {
    const credentials = this.#users.findCredentialsByUsername(username)
    const passwordMatches = await verifyPassword(
      credentials?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    )
    if (credentials === null || !passwordMatches) {
      return null
    }

    const totpResult = await verifyTotp({
      secret: credentials.totpSecret,
      token: totp,
      epoch: epochSeconds,
      epochTolerance: 30,
    })
    return totpResult.valid ? credentials.id : null
  }
}
