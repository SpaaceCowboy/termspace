import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAllowedOrigin } from './origin.js'

describe('isAllowedOrigin', () => {
  it('accepts only the configured origin', () => {
    assert.equal(
      isAllowedOrigin('https://termspace.example', 'https://termspace.example'),
      true,
    )
    assert.equal(
      isAllowedOrigin('https://other.example', 'https://termspace.example'),
      false,
    )
  })

  it('compares scheme and port', () => {
    assert.equal(
      isAllowedOrigin('http://termspace.example', 'https://termspace.example'),
      false,
    )
    assert.equal(
      isAllowedOrigin(
        'https://termspace.example:444',
        'https://termspace.example',
      ),
      false,
    )
  })

  it('rejects missing, malformed, and path-bearing Origin headers', () => {
    assert.equal(isAllowedOrigin(undefined, 'https://termspace.example'), false)
    assert.equal(isAllowedOrigin('not a URL', 'https://termspace.example'), false)
    assert.equal(
      isAllowedOrigin(
        'https://termspace.example/path',
        'https://termspace.example',
      ),
      false,
    )
  })
})
