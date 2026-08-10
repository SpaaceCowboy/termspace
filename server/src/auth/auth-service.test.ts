import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

import { argon2id, hash } from 'argon2'
import { generate, generateSecret } from 'otplib'

import type { UserCredentials } from './user-repository.js'
import { AuthService } from './auth-service.js'

const EPOCH_SECONDS = 1_767_225_600
const SECRET = generateSecret()
let passwordHash = ''

before(async () => {
  passwordHash = await hash('correct horse battery staple', { type: argon2id })
})

function createService(user: UserCredentials | null): AuthService {
  return new AuthService({
    findCredentialsByUsername: () => user,
  })
}

describe('AuthService', () => {
  it('accepts a matching argon2id password and TOTP', async () => {
    const service = createService({
      id: 'user-1',
      username: 'owner',
      passwordHash,
      totpSecret: SECRET,
      createdAt: 1,
    })
    const token = await generate({ secret: SECRET, epoch: EPOCH_SECONDS })

    assert.equal(
      await service.authenticate(
        'owner',
        'correct horse battery staple',
        token,
        EPOCH_SECONDS,
      ),
      'user-1',
    )
  })

  it('rejects a bad password or TOTP without identifying which failed', async () => {
    const service = createService({
      id: 'user-1',
      username: 'owner',
      passwordHash,
      totpSecret: SECRET,
      createdAt: 1,
    })
    const token = await generate({ secret: SECRET, epoch: EPOCH_SECONDS })
    const invalidToken = `${token.startsWith('0') ? '1' : '0'}${token.slice(1)}`

    assert.equal(
      await service.authenticate('owner', 'incorrect password', token, EPOCH_SECONDS),
      null,
    )
    assert.equal(
      await service.authenticate(
        'owner',
        'correct horse battery staple',
        invalidToken,
        EPOCH_SECONDS,
      ),
      null,
    )
  })

  it('rejects an unknown user through the same result channel', async () => {
    const service = createService(null)
    assert.equal(
      await service.authenticate(
        'missing',
        'incorrect password',
        '000000',
        EPOCH_SECONDS,
      ),
      null,
    )
  })
})
