/**
 * Termspace service worker. Its only job is push: it holds no cache and
 * intercepts no fetches, because a terminal app has nothing worth serving
 * offline and a stale shell would be worse than no shell.
 */

self.addEventListener('install', () => {
  // Replace the previous worker immediately rather than waiting for every tab
  // to close; there is no cached state that a version skew could corrupt.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (event.data === null || event.data === undefined) {
    return
  }

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null
  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === 'string' ? payload.title : 'Termspace',
      {
        body: typeof payload.body === 'string' ? payload.body : '',
        // One notification per session: a session asking twice should replace
        // its own notification rather than stack up.
        tag: sessionId === null ? 'termspace' : `session:${sessionId}`,
        renotify: sessionId !== null,
        data: { sessionId },
        icon: '/icon.png',
        badge: '/icon.png',
      },
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const sessionId = event.notification.data?.sessionId ?? null
  const target = sessionId === null ? '/workspace' : `/workspace?session=${sessionId}`

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Focus an existing tab rather than opening a second copy of the
      // workspace — every tab holds its own WebSocket and terminals.
      for (const client of clientList) {
        if (new URL(client.url).pathname.startsWith('/workspace')) {
          await client.focus()
          client.postMessage({ type: 'focus-session', sessionId })
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
