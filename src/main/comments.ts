import type { ChatComment } from '@shared/types'

/**
 * Notizen zu Stellen im Verlauf („Kommentare wie in Word“). Sie liegen neben dem Transkript und
 * gehen nie an die CLI. Hier nur die reinen Listenoperationen; Ablage und IPC im Hauptprozess.
 */

/** Zitate werden gekürzt gespeichert – sie dienen nur dem Wiederfinden der Stelle. */
export const MAX_QUOTE = 300

export function addComment(list: ChatComment[], c: { id: string; itemId: string; quote?: string; text: string }, now = Date.now()): ChatComment[] {
  const quote = c.quote?.trim().slice(0, MAX_QUOTE)
  return [...list, { id: c.id, itemId: c.itemId, ...(quote ? { quote } : {}), text: c.text.trim(), createdAt: now, updatedAt: now }]
}

/** Text ändern; leerer Text löscht die Notiz (wie ein verworfener Entwurf). */
export function updateComment(list: ChatComment[], id: string, text: string, now = Date.now()): ChatComment[] {
  const t = text.trim()
  if (!t) return removeComment(list, id)
  return list.map((c) => (c.id === id ? { ...c, text: t, updatedAt: now } : c))
}

export function removeComment(list: ChatComment[], id: string): ChatComment[] {
  return list.filter((c) => c.id !== id)
}

/** Leere Notizen (abgebrochene Eingaben) und Einträge ohne Bezug aussortieren. */
export function cleanComments(raw: unknown): ChatComment[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (c): c is ChatComment =>
      !!c && typeof c === 'object' && typeof c.id === 'string' && typeof c.itemId === 'string' && typeof c.text === 'string' && !!c.text.trim()
  )
}
