import webpush from 'web-push'

import type { PushSendResult, PushSender } from './push-notifier.js'
import type { StoredPushSubscription } from './push-repository.js'

export interface VapidConfig {
  readonly publicKey: string
  readonly privateKey: string
  /** A mailto: or https: URL the push service can use to contact the operator. */
  readonly subject: string
}

/**
 * Timeouts are not optional here: a push service is a vendor we do not control,
 * and a hung request would hold a notification — and its promise — open
 * indefinitely. `web-push` has no timeout of its own, so it is raced.
 */
const SEND_TIMEOUT_MS = 8_000

/**
 * The real Web Push transport. Isolated behind `PushSender` so the notifier's
 * fan-out, expiry handling and logging can be tested without crypto, a network,
 * or a push service.
 */
export function createWebPushSender(vapid: VapidConfig): PushSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  return {
    async send(subscription: StoredPushSubscription, payload: string): Promise<PushSendResult> {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), SEND_TIMEOUT_MS)
      try {
        await Promise.race([
          webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
            },
            payload,
            { TTL: 300 },
          ),
          new Promise((_resolve, reject) => {
            timeout.signal.addEventListener('abort', () => {
              reject(new Error(`Push send exceeded ${String(SEND_TIMEOUT_MS)}ms`))
            })
          }),
        ])
        return { outcome: 'sent' }
      } catch (error) {
        // 404 and 410 are the push service saying this endpoint is permanently
        // gone — the browser was uninstalled, or permission was revoked.
        // Anything else may be transient and the row is kept.
        const statusCode = readStatusCode(error)
        if (statusCode === 404 || statusCode === 410) {
          return { outcome: 'expired' }
        }
        return { outcome: 'failed', error }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function readStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }
  const candidate: unknown = (error as { statusCode?: unknown }).statusCode
  return typeof candidate === 'number' ? candidate : null
}

/**
 * Push is optional. Without a key pair the server runs with notifications off
 * rather than refusing to boot, and `GET /api/config` reports a null public key
 * so the UI hides the feature instead of offering something that cannot work.
 */
export function readVapidConfig(environment: {
  readonly TERMSPACE_VAPID_PUBLIC_KEY?: string | undefined
  readonly TERMSPACE_VAPID_PRIVATE_KEY?: string | undefined
  readonly TERMSPACE_VAPID_SUBJECT?: string | undefined
}): VapidConfig | null {
  const publicKey = environment.TERMSPACE_VAPID_PUBLIC_KEY
  const privateKey = environment.TERMSPACE_VAPID_PRIVATE_KEY
  if (
    publicKey === undefined ||
    privateKey === undefined ||
    publicKey === '' ||
    privateKey === ''
  ) {
    return null
  }
  return {
    publicKey,
    privateKey,
    subject: environment.TERMSPACE_VAPID_SUBJECT ?? 'mailto:operator@termspace.local',
  }
}

/** Generates a key pair for `server/.env`. Used by the CLI, never at runtime. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys()
}
