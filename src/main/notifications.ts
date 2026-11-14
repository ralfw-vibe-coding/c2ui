import type { AgentEvent, LayoutNode } from '@shared/types'

/**
 * Benachrichtigungen über Chats im Hintergrund: fertig oder hängt.
 *
 * `TurnWatch` enthält nur die Zeitlogik (ohne Electron): Jedes Ereignis eines Chats gilt als
 * Lebenszeichen; kommt während eines Turns lange keines, hängt er. Je Turn wird höchstens einmal
 * gemeldet, damit es nicht nervt.
 */

export interface Stalled {
  chatId: string
  /** Wie lange schon still (ms). */
  silentMs: number
}

export class TurnWatch {
  /** chatId → Zeit des letzten Lebenszeichens, solange der Chat arbeitet. */
  private live = new Map<string, number>()
  private reported = new Set<string>()

  /** Lebenszeichen eines arbeitenden Chats (jedes Ereignis). */
  touch(chatId: string, now = Date.now()): void {
    if (this.live.has(chatId)) this.live.set(chatId, now)
  }

  setBusy(chatId: string, busy: boolean, now = Date.now()): void {
    this.reported.delete(chatId)
    if (busy) this.live.set(chatId, now)
    else this.live.delete(chatId)
  }

  forget(chatId: string): void {
    this.live.delete(chatId)
    this.reported.delete(chatId)
  }

  /** Chats, die seit `minutes` nichts mehr gemeldet haben – je Turn nur beim ersten Mal. */
  stalled(minutes: number, now = Date.now()): Stalled[] {
    const limit = Math.max(1, minutes) * 60_000
    const out: Stalled[] = []
    for (const [chatId, last] of this.live) {
      const silentMs = now - last
      if (silentMs < limit || this.reported.has(chatId)) continue
      this.reported.add(chatId)
      out.push({ chatId, silentMs })
    }
    return out
  }
}

/** Ereignisse, die als Lebenszeichen zählen (Zustandsmeldungen wie `session` nicht). */
export function isSignOfLife(e: AgentEvent): boolean {
  return e.kind !== 'session' && e.kind !== 'context'
}

/** Ist der Chat gerade in einer Zelle zu sehen? */
export function isOnScreen(root: LayoutNode, chatId: string): boolean {
  if (root.type === 'leaf') return root.chatId === chatId
  return root.children.some((c) => isOnScreen(c, chatId))
}

/**
 * Soll über einen Chat benachrichtigt werden? Nur, wenn man ihn nicht ohnehin sieht:
 * Fenster nicht im Vordergrund oder Chat in keiner Zelle offen.
 */
export function shouldNotify(opts: { enabled: boolean; focused: boolean; onScreen: boolean }): boolean {
  return opts.enabled && (!opts.focused || !opts.onScreen)
}

/** Text der Meldung „fertig“. */
export function doneMessage(title: string, isError: boolean, errorText?: string): { title: string; body: string } {
  return isError
    ? { title: `Fehlgeschlagen: ${title}`, body: errorText?.slice(0, 200) || 'Der Turn ist fehlgeschlagen.' }
    : { title: `Fertig: ${title}`, body: 'Der Chat hat geantwortet.' }
}

/** Text der Meldung „hängt“. */
export function stalledMessage(title: string, silentMs: number): { title: string; body: string } {
  const min = Math.max(1, Math.round(silentMs / 60_000))
  return { title: `Keine Regung: ${title}`, body: `Seit ${min} ${min === 1 ? 'Minute' : 'Minuten'} kommt nichts mehr. Vielleicht wartet die CLI auf etwas.` }
}
