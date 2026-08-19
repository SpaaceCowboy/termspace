import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  NOTIFICATION_HISTORY_LIMIT,
  parseNotificationHistory,
  readNotificationHistory,
} from './notification-history.ts'

test('notification history validates, sorts, and bounds persisted entries', () => {
  const source = Array.from({ length: NOTIFICATION_HISTORY_LIMIT + 5 }, (_, index) => ({
    id: index + 1,
    message: `notice ${String(index)}`,
    tone: index % 2 === 0 ? 'info' : 'warning',
    createdAt: index,
    read: false,
  }))
  const parsed = parseNotificationHistory([...source, { message: 'invalid' }])
  assert.equal(parsed.length, NOTIFICATION_HISTORY_LIMIT)
  assert.equal(parsed[0]?.createdAt, NOTIFICATION_HISTORY_LIMIT + 4)
})

test('notification history rejects malformed storage', () => {
  assert.deepEqual(readNotificationHistory({ getItem: () => '{' }), [])
  assert.deepEqual(parseNotificationHistory([{ id: 1, message: 'x', tone: 'secret', createdAt: 1, read: false }]), [])
})
