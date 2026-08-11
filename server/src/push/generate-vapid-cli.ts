import { generateVapidKeys } from './web-push-sender.js'

/**
 * Prints a VAPID key pair in the shape `server/.env` wants. Run once; the
 * public key is baked into every browser subscription, so rotating it
 * invalidates every existing one.
 */
const keys = generateVapidKeys()
process.stdout.write(
  [
    '# Web Push. Rotating these invalidates every existing subscription.',
    `TERMSPACE_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `TERMSPACE_VAPID_PRIVATE_KEY=${keys.privateKey}`,
    '# Contact point for the push service, mailto: or https:',
    'TERMSPACE_VAPID_SUBJECT=mailto:you@example.com',
    '',
  ].join('\n'),
)
