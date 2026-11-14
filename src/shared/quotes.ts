/** Bezug auf eine Stelle im Chat: markiertes Zitat plus optionale Anmerkung. */
export interface QuoteRef {
  id: string
  quote: string
  note: string
}

/** Zitate werden gekürzt gespeichert und übernommen – sie dienen dem Wiederfinden der Stelle. */
export const MAX_QUOTE = 300

/** Bereinigt markierten Text: Leerzeichen am Rand, höchstens eine Leerzeile am Stück. */
export function cleanQuote(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Zitat als Markdown-Blockzitat (`> …` je Zeile). */
export function blockquote(quote: string): string {
  return cleanQuote(quote)
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n')
}

/**
 * Nachricht aus Bezügen und freiem Text: je Bezug das Zitat als Blockzitat, darunter die Anmerkung;
 * am Ende der Text aus dem Eingabefeld.
 */
export function composeMessage(refs: QuoteRef[], text: string): string {
  const parts = refs.map((r) => [blockquote(r.quote), r.note.trim()].filter(Boolean).join('\n\n'))
  if (text.trim()) parts.push(text.trim())
  return parts.join('\n\n')
}

export type MessagePart = { kind: 'text'; text: string } | { kind: 'quote'; text: string }

/** Zerlegt eine Nutzernachricht für die Anzeige in Text und Blockzitate (Zeilen mit `>`). */
export function splitQuotes(text: string): MessagePart[] {
  const parts: MessagePart[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^>\s?(.*)$/)
    const kind = m ? 'quote' : 'text'
    const content = m ? m[1] : line
    const last = parts[parts.length - 1]
    if (last && last.kind === kind) last.text += '\n' + content
    else parts.push({ kind, text: content } as MessagePart)
  }
  // Leerzeilen zwischen Teilen nicht doppelt anzeigen
  return parts
    .map((p) => ({ ...p, text: p.kind === 'text' ? p.text.replace(/^\n+|\n+$/g, '') : p.text }))
    .filter((p) => p.text.trim() !== '')
}

/** Kurzer Titel für einen abgezweigten Chat aus Anmerkung oder Zitat. */
export function forkTitle(ref: Pick<QuoteRef, 'quote' | 'note'>): string {
  const base = (ref.note.trim() || ref.quote).replace(/\s+/g, ' ').trim()
  return base.length > 50 ? base.slice(0, 47) + '…' : base
}
