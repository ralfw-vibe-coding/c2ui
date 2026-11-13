import type { Transcript, TranscriptItem } from './types'

/**
 * Zusammenführen (Merge) eines Nebenchats B in einen Chat A:
 * B arbeitet seine Ergebnisse auf (Prompt „prepare“), A übernimmt die Aufarbeitung (Prompt „adopt“).
 * Alternativ geht der Verlauf von B direkt nach A.
 */

type UserItem = Extract<TranscriptItem, { type: 'user' }>

/** Platzhalter {Titel} (Nebenchat B) und {Ziel} (Chat A) einsetzen. */
export function fillPrompt(template: string, vars: { source: string; target: string }): string {
  return template.replace(/\{Titel\}/g, vars.source).replace(/\{Ziel\}/g, vars.target)
}

/** Eigener Prompt, sonst der Standard. */
export function promptOr(own: string | undefined, fallback: string): string {
  return own?.trim() ? own.trim() : fallback
}

const isTurnStart = (it: TranscriptItem): it is UserItem => it.type === 'user' && !it.steer

/** Text eines Antwort-Eintrags (ohne Denken und Werkzeuge). */
function textOf(it: TranscriptItem): string {
  return it.type === 'assistant'
    ? it.blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('\n\n')
        .trim()
    : ''
}

/** Index hinter dem Turn, der mit der Nutzernachricht an `start` beginnt. */
function turnEnd(t: Transcript, start: number): number {
  let i = start + 1
  while (i < t.length && !isTurnStart(t[i])) i++
  return i
}

/** Abschließende Antwort des Turns, der mit dieser Nutzernachricht beginnt (letzter Antwortblock mit Text). */
export function answerAfter(t: Transcript, userItemId: string): string {
  const start = t.findIndex((it) => it.id === userItemId)
  if (start < 0) return ''
  const end = turnEnd(t, start)
  for (let i = end - 1; i > start; i--) {
    const s = textOf(t[i])
    if (s) return s
  }
  return ''
}

/** Nutzernachrichten, die einen Turn beginnen. */
export function turnStarts(t: Transcript): UserItem[] {
  return t.filter(isTurnStart)
}

/** Ist das die letzte Nutzernachricht des Chats (bzw. keine angegeben)? */
export function isLastTurn(t: Transcript, userItemId?: string): boolean {
  const starts = turnStarts(t)
  return !userItemId || !starts.length || starts[starts.length - 1].id === userItemId
}

/**
 * Verlauf von B als Text (für die direkte Übernahme): Nutzernachrichten und die jeweils abschließende Antwort,
 * bis einschließlich des Turns von `upToItemId`.
 */
export function transcriptExcerpt(t: Transcript, upToItemId?: string): string {
  const stop = upToItemId ? t.findIndex((it) => it.id === upToItemId) : -1
  const limit = stop >= 0 ? turnEnd(t, stop) : t.length
  const parts: string[] = []
  for (let i = 0; i < limit; i++) {
    const it = t[i]
    if (!isTurnStart(it)) continue
    parts.push(`**Frage:** ${it.text.trim()}`)
    const answer = answerAfter(t, it.id)
    if (answer) parts.push(`**Antwort:** ${answer}`)
  }
  return parts.join('\n\n')
}

/** Hinweis an B, wenn nur bis zu einer früheren Nachricht aufgearbeitet werden soll. */
export function scopeNote(label: string): string {
  return `\n\n(Berücksichtige dabei nur den Verlauf bis einschließlich meiner Nachricht „${label}“.)`
}

/** Nachricht an A: Übernahme-Prompt, darunter die Aufarbeitung aus B. */
export function adoptMessage(adopt: string, sourceTitle: string, body: string): string {
  return `${adopt.trim()}\n\n---\nAus dem Nebengespräch „${sourceTitle}“:\n\n${body.trim()}`
}
