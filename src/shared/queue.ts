import type { QuoteRef } from './quotes'
import type { Attachment } from './types'

/** Eine eingereihte Nachricht: wird gesendet, sobald der Chat frei ist. */
export interface QueuedMessage {
  id: string
  text: string
  refs: QuoteRef[]
  attachments: Attachment[]
}

/**
 * Warteschlange eines Chats. Nach einem abgebrochenen oder fehlgeschlagenen Turn hält sie an,
 * damit nicht blind weitergearbeitet wird; der Nutzer setzt sie fort oder räumt sie ab.
 */
export interface ChatQueue {
  items: QueuedMessage[]
  paused: boolean
  /** Grund des Anhaltens (zur Anzeige). */
  reason?: string
}

export const EMPTY_QUEUE: ChatQueue = { items: [], paused: false }

export function enqueue(q: ChatQueue, item: QueuedMessage): ChatQueue {
  return { ...q, items: [...q.items, item] }
}

export function removeQueued(q: ChatQueue, id: string): ChatQueue {
  const items = q.items.filter((m) => m.id !== id)
  return items.length ? { ...q, items } : EMPTY_QUEUE
}

/** Ende eines Turns: bei Fehler/Abbruch anhalten, sofern etwas wartet. */
export function afterTurn(q: ChatQueue, isError: boolean, errorText?: string): ChatQueue {
  if (!isError || q.items.length === 0) return q
  return { ...q, paused: true, reason: errorText === 'Abgebrochen.' ? 'Antwort abgebrochen' : 'Letzter Turn fehlgeschlagen' }
}

export function resume(q: ChatQueue): ChatQueue {
  return { items: q.items, paused: false }
}

/** Nächste zu sendende Nachricht, falls der Chat frei ist und die Schlange läuft. */
export function takeNext(q: ChatQueue, busy: boolean): { queue: ChatQueue; next?: QueuedMessage } {
  if (busy || q.paused || q.items.length === 0) return { queue: q }
  const [next, ...items] = q.items
  return { queue: items.length ? { ...q, items } : EMPTY_QUEUE, next }
}

/** Senden fehlgeschlagen: Nachricht wieder vorn einreihen und anhalten. */
export function sendFailed(q: ChatQueue, item: QueuedMessage, error: string): ChatQueue {
  return { items: [item, ...q.items], paused: true, reason: error }
}

/** Soll eine neue Eingabe eingereiht statt direkt gesendet werden? */
export function shouldQueue(q: ChatQueue, busy: boolean): boolean {
  return busy || (q.items.length > 0 && !q.paused)
}

/** Kurzinfo zu Bezügen und Anhängen einer eingereihten Nachricht. */
export function queuedMeta(m: QueuedMessage): string {
  const parts: string[] = []
  if (m.refs.length) parts.push(m.refs.length === 1 ? '1 Bezug' : `${m.refs.length} Bezüge`)
  if (m.attachments.length) parts.push(m.attachments.length === 1 ? '1 Anhang' : `${m.attachments.length} Anhänge`)
  return parts.join(' · ')
}
