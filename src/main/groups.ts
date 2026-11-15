import type { BoardGroup } from '@shared/types'

/**
 * Gruppen im Diskursboard: benannte Strecken von Nachrichten. Sie gehören zum Baum und werden
 * neben den Chats abgelegt; hier nur das Aussortieren kaputter Einträge.
 */
export function cleanGroups(raw: unknown): BoardGroup[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.filter((g): g is BoardGroup => {
    if (!g || typeof g !== 'object') return false
    const ok =
      typeof g.id === 'string' &&
      typeof g.chatId === 'string' &&
      typeof g.fromItemId === 'string' &&
      typeof g.toItemId === 'string' &&
      typeof g.label === 'string' &&
      !!g.id &&
      !seen.has(g.id)
    if (ok) seen.add(g.id)
    return ok
  })
}
