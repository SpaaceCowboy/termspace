import assert from 'node:assert/strict'
import { test } from 'node:test'

import { slugifyForPath, suggestProjectPath } from './project-path.ts'

test('suggests a directory under the project root', () => {
  assert.equal(suggestProjectPath('/srv/projects', 'Portal UI'), '/srv/projects/portal-ui')
  assert.equal(
    suggestProjectPath('/srv/projects', '  API   Refactor!! '),
    '/srv/projects/api-refactor',
  )
})

test('does not double the separator when the root has a trailing slash', () => {
  assert.equal(suggestProjectPath('/srv/projects/', 'Portal UI'), '/srv/projects/portal-ui')
})

test('suggests nothing until the root is known or the name is usable', () => {
  assert.equal(suggestProjectPath(null, 'Portal UI'), '')
  assert.equal(suggestProjectPath('/srv/projects', ''), '')
  assert.equal(suggestProjectPath('/srv/projects', '!!!'), '')
})

test('cannot suggest a path that escapes the root', () => {
  for (const name of ['../etc', '..', '/etc/passwd', 'a/../../b']) {
    const suggested = suggestProjectPath('/srv/projects', name)
    assert.equal(
      suggested === '' || suggested.startsWith('/srv/projects/'),
      true,
      `escaped with ${name}: ${suggested}`,
    )
    assert.equal(suggested.includes('..'), false, `kept traversal for ${name}`)
  }
})

test('slugifies the way the server does', () => {
  assert.equal(slugifyForPath('Portal UI'), 'portal-ui')
  assert.equal(slugifyForPath('!!!'), '')
  assert.equal(slugifyForPath('a'.repeat(100)).length, 48)
})
