'use client'

import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '@/lib/data'

import { base64UrlToBytes, pushSupport, type PushPermission } from './push-keys.ts'

export interface PushApi {
  readonly permission: PushPermission
  /** True while a subscribe or unsubscribe is in flight. */
  readonly busy: boolean
  readonly subscribed: boolean
  readonly error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
}

function readSupport(): PushPermission {
  if (typeof window === 'undefined') {
    return 'unsupported'
  }
  return pushSupport({
    isSecureContext: window.isSecureContext,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
  })
}

/**
 * Registers the service worker and owns the push subscription.
 *
 * The permission prompt is only ever raised from `enable`, never on mount: a
 * browser that is asked for notification permission without the user pressing
 * anything will deny it permanently, and there is no way back from that.
 */
export function usePush(publicKey: string | null, enabled: boolean): PushApi {
  const [permission, setPermission] = useState<PushPermission>('unsupported')
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || publicKey === null) {
      return
    }
    setPermission(readSupport())

    let cancelled = false
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const existing = await registration.pushManager.getSubscription()
        if (!cancelled) {
          setSubscribed(existing !== null)
        }
      } catch {
        // A worker that will not register means push is unavailable here, which
        // the UI already has a state for.
        if (!cancelled) {
          setPermission('unsupported')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, publicKey])

  const enable = useCallback(async () => {
    if (publicKey === null || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const granted = await Notification.requestPermission()
      setPermission(granted === 'granted' ? 'granted' : 'denied')
      if (granted !== 'granted') {
        setError(
          granted === 'denied'
            ? 'Notifications are blocked for this site. You will have to allow them in your browser settings.'
            : 'Notifications were not allowed.',
        )
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required by every browser: a push that shows nothing is not allowed.
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        }))

      const response = await dataSource.subscribeToPush(
        JSON.parse(JSON.stringify(subscription)) as Parameters<
          typeof dataSource.subscribeToPush
        >[0],
      )
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      setSubscribed(true)
    } catch {
      setError('Could not turn notifications on.')
    } finally {
      setBusy(false)
    }
  }, [busy, publicKey])

  const disable = useCallback(async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription !== null) {
        // Tell the server first: if the browser-side unsubscribe succeeds and
        // the request then fails, the server keeps pushing to a dead endpoint.
        await dataSource.unsubscribeFromPush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      setError('Could not turn notifications off.')
    } finally {
      setBusy(false)
    }
  }, [busy])

  return { permission, busy, subscribed, error, enable, disable }
}
