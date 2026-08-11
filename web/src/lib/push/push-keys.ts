/**
 * `PushManager.subscribe` wants the VAPID public key as raw bytes, but it
 * travels as base64url. This is the conversion, kept out of the hook so it can
 * be tested without a browser.
 */
export function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64)
  // An explicit ArrayBuffer, not the default: `applicationServerKey` will not
  // accept a view that might be backed by a SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/**
 * Push needs a secure context, so it is unavailable over plain HTTP to anything
 * but localhost. Worth detecting explicitly: the alternative is a button that
 * silently does nothing on a LAN address.
 */
export function pushSupport(scope: {
  readonly isSecureContext: boolean
  readonly hasServiceWorker: boolean
  readonly hasPushManager: boolean
  readonly hasNotification: boolean
  readonly permission: string
}): PushPermission {
  if (
    !scope.isSecureContext ||
    !scope.hasServiceWorker ||
    !scope.hasPushManager ||
    !scope.hasNotification
  ) {
    return 'unsupported'
  }
  if (scope.permission === 'granted' || scope.permission === 'denied') {
    return scope.permission
  }
  return 'default'
}
