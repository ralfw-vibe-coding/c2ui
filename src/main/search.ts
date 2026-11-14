import type { Chat, ChatComment, Transcript } from '@shared/types'

/**
 * Suche über alle Chats: Titel und Verläufe. Läuft im Hauptprozess, weil dort alle Transkripte
 * liegen – auch die von Chats, die gerade nicht offen sind.
 */

export interface SearchHit {
  /** Transkript-Eintrag (Sprungziel). */
  itemId: string
  ts?: number
  role: 'user' | 'assistant' | 'notice' | 'error' | 'note'
  /** Textausschnitt um den Treffer. */
  snippet: string
}

export interface SearchResult {
  chatId: string
  title: string
  agent: Chat['agent']
  cwd: string
  updatedAt: number
  /** Der Titel selbst passt. */
  inTitle: boolean
  hits: SearchHit[]
  /** Treffer im Verlauf und in den Notizen insgesamt (auch die nicht gezeigten). */
  total: number
}

const norm = (s: string): string => s.toLowerCase()

/** Textausschnitt um den ersten Treffer, mit „…“ an den Schnittkanten. */
export function snippetOf(text: string, needle: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const i = norm(flat).indexOf(norm(needle))
  if (i < 0) return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
  const before = Math.max(0, i - Math.floor((max - needle.length) / 2))
  const end = Math.min(flat.length, before + max)
  return (before > 0 ? '…' : '') + flat.slice(before, end).trim() + (end < flat.length ? '…' : '')
}

/** Durchsuchbarer Text eines Eintrags (Antworten: nur echter Text, keine Werkzeugaufrufe). */
function textOf(item: Transcript[number]): string {
  switch (item.type) {
    case 'user':
    case 'notice':
    case 'error':
      return item.text
    case 'assistant':
      return item.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n')
    default:
      return ''
  }
}

export interface SearchOptions {
  /** Höchstens so viele Chats im Ergebnis. */
  maxChats?: number
  /** Höchstens so viele Textstellen je Chat. */
  maxHits?: number
  /** Notizen eines Chats – sie werden mitdurchsucht (eigene Ebene, nicht im Verlauf). */
  commentsOf?: (chatId: string) => ChatComment[]
}

/**
 * Chats, deren Titel oder Verlauf den Suchtext enthalten – neueste zuerst.
 * `transcriptOf` liefert den Verlauf eines Chats (im Hauptprozess aus der Ablage).
 */
export function searchChats(
  chats: Chat[],
  transcriptOf: (chatId: string) => Transcript,
  query: string,
  { maxChats = 50, maxHits = 3, commentsOf }: SearchOptions = {}
): SearchResult[] {
  const q = query.trim()
  if (q.length < 2) return []
  const needle = norm(q)
  const out: SearchResult[] = []

  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const inTitle = norm(chat.title).includes(needle)
    const hits: SearchHit[] = []
    let total = 0
    for (const item of transcriptOf(chat.id)) {
      if (item.type === 'turn') continue
      const text = textOf(item)
      if (!text || !norm(text).includes(needle)) continue
      total++
      if (hits.length < maxHits) {
        hits.push({
          itemId: item.id,
          ...(item.type === 'user' ? { ts: item.ts } : {}),
          role: item.type,
          snippet: snippetOf(text, q)
        })
      }
    }
    // Notizen gehören nicht zum Verlauf, sind aber Teil des Chats – sie werden mitgefunden.
    for (const c of commentsOf?.(chat.id) ?? []) {
      if (!norm(c.text).includes(needle)) continue
      total++
      if (hits.length < maxHits) hits.push({ itemId: c.itemId, ts: c.updatedAt, role: 'note', snippet: snippetOf(c.text, q) })
    }
    if (!inTitle && !total) continue
    out.push({ chatId: chat.id, title: chat.title, agent: chat.agent, cwd: chat.cwd, updatedAt: chat.updatedAt, inTitle, hits, total })
    if (out.length >= maxChats) break
  }
  return out
}
