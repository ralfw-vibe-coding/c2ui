/**
 * Große Einfügungen landen als Anhang statt im Eingabefeld. Das Feld ist auf 220 px gedeckelt,
 * darin stehen gut elf Zeilen – was deutlich darüber liegt, ist Material und kein Satz mehr.
 * Gezählt wird ein einzelner Einfügevorgang, nicht der Inhalt des Feldes: Selbst getippter
 * Text bleibt immer, wo er ist.
 */

export interface PasteLimits {
  /** Ab so vielen Zeilen wird angehängt (0 = nie). */
  lines: number
  /** Ab so vielen Zeichen wird angehängt (0 = nie). */
  chars: number
}

/**
 * Zwanzig Zeilen liegen knapp über dem, was man noch im Feld überblickt; 2000 Zeichen fangen
 * den anderen Fall ab – eine einzige sehr lange Zeile (minifiziertes JSON, Base64).
 */
export const DEFAULT_PASTE: PasteLimits = { lines: 20, chars: 2000 }

/** Dateiname für angehängten Einfügetext (die Ablage hängt bei Bedarf eine Nummer an). */
export const PASTE_FILE = 'einfuegung.txt'

/** Ist dieser Einfügevorgang zu groß fürs Eingabefeld? */
export function pasteTooBig(text: string, limits: PasteLimits = DEFAULT_PASTE): boolean {
  if (!text) return false
  const lines = limits.lines > 0 && countLines(text) > limits.lines
  const chars = limits.chars > 0 && text.length > limits.chars
  return lines || chars
}

export function countLines(text: string): number {
  return text ? text.split(/\r\n|\r|\n/).length : 0
}

/** Kurzbeschreibung für den Hinweis: Umfang und der Anfang des Textes. */
export function pasteSummary(text: string): string {
  const zeilen = countLines(text)
  const anfang = text.trim().split(/\r\n|\r|\n/)[0]?.trim() ?? ''
  const kurz = anfang.length > 60 ? anfang.slice(0, 57) + '…' : anfang
  return `${zeilen} ${zeilen === 1 ? 'Zeile' : 'Zeilen'}, ${text.length} Zeichen${kurz ? `: „${kurz}“` : ''}`
}
