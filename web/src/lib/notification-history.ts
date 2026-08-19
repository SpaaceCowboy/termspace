export const NOTIFICATION_STORAGE_KEY = 'termspace:notifications:v1'
export const NOTIFICATION_HISTORY_LIMIT = 50
export type ToastTone = 'info' | 'warning' | 'error'

export interface NotificationItem {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
  readonly createdAt: number
  readonly read: boolean
}

export function parseNotificationHistory(value: unknown): readonly NotificationItem[] {
  if (!Array.isArray(value)) return []
  const valid: NotificationItem[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const item = candidate as Record<string, unknown>
    if (
      typeof item.id !== 'number' || !Number.isSafeInteger(item.id) || item.id < 1 ||
      typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) ||
      typeof item.message !== 'string' || item.message.length < 1 || item.message.length > 1_000 ||
      (item.tone !== 'info' && item.tone !== 'warning' && item.tone !== 'error') ||
      typeof item.read !== 'boolean'
    ) continue
    valid.push({
      id: item.id,
      createdAt: item.createdAt,
      message: item.message,
      tone: item.tone,
      read: item.read,
    })
  }
  return valid
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, NOTIFICATION_HISTORY_LIMIT)
}

export function readNotificationHistory(
  storage: Pick<Storage, 'getItem'>,
): readonly NotificationItem[] {
  try {
    const raw = storage.getItem(NOTIFICATION_STORAGE_KEY)
    return raw === null ? [] : parseNotificationHistory(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}
