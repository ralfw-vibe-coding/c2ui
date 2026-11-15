import { MAX_QUOTE } from '@shared/quotes'
import type { Bookmark } from '@shared/types'

/**
 * Lesezeichen an Stellen im Verlauf. Sie liegen neben dem Transkript (`bookmarks/<chatId>`) und
 * gehen nie an die CLI; hier nur die reinen Listenoperationen.
 */

export function addBookmark(list: Bookmark[], b: { id: string; itemId: string; quote?: string; label?: string }, now = Date.now()): Bookmark[] {
  const quote = b.quote?.trim().slice(0, MAX_QUOTE)
  const label = b.label?.trim()
  return [...list, { id: b.id, itemId: b.itemId, ...(quote ? { quote } : {}), ...(label ? { label } : {}), createdAt: now }]
}

/** Beschriftung ändern; leer heißt „keine eigene Beschriftung“ (dann steht das Zitat da). */
export function labelBookmark(list: Bookmark[], id: string, label: string): Bookmark[] {
  const t = label.trim()
  return list.map((b) => (b.id === id ? { ...b, ...(t ? { label: t } : { label: undefined }) } : b))
}

export function removeBookmark(list: Bookmark[], id: string): Bookmark[] {
  return list.filter((b) => b.id !== id)
}

/** Kaputte Einträge aussortieren (z. B. aus einer älteren Fassung). */
export function cleanBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.filter((b): b is Bookmark => {
    const ok = !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.itemId === 'string' && !!b.id && !seen.has(b.id)
    if (ok) seen.add(b.id)
    return ok
  })
}
