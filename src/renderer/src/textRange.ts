/**
 * Zitierte Stellen im gerenderten Verlauf wiederfinden und markieren.
 *
 * Verglichen wird ohne Leerraum: Die Markierung des Nutzers (Selection.toString) enthält Zeilenumbrüche
 * zwischen Absätzen und Listenpunkten, die im DOM als Textknoten fehlen können – und umgekehrt.
 */

const SKIP = '.fork-markers, .fork-slot'
const BLOCKS = 'li, p, pre, table, blockquote, h1, h2, h3, h4, h5, h6'

/** Zeichenweise Zuordnung des Texts ohne Leerraum zu Textknoten und Offset. */
function textMap(roots: Element[]): { text: string; at: { node: Text; offset: number }[] } {
  let text = ''
  const at: { node: Text; offset: number }[] = []
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    })
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const s = n.data
      for (let i = 0; i < s.length; i++) {
        if (/[\s​]/.test(s[i])) continue
        text += s[i]
        at.push({ node: n, offset: i })
      }
    }
  }
  return { text, at }
}

const squash = (s: string): string => s.replace(/[\s​]+/g, '')

/**
 * Textbereich des Zitats in den gegebenen Elementen. Findet sich das ganze Zitat nicht (z. B. gekürzt
 * gespeichert), genügt der Anfang.
 */
export function findQuoteRange(roots: Element[], quote: string): Range | null {
  const q = squash(quote)
  if (!q || !roots.length) return null
  const { text, at } = textMap(roots)
  let len = q.length
  let idx = text.indexOf(q)
  if (idx < 0 && q.length > 40) {
    len = 40
    idx = text.indexOf(q.slice(0, 40))
  }
  if (idx < 0) return null
  const start = at[idx]
  const end = at[idx + len - 1]
  const r = document.createRange()
  r.setStart(start.node, start.offset)
  r.setEnd(end.node, end.offset + 1)
  return r
}

/** Alle Fundstellen eines Suchtexts in den gegebenen Elementen (ohne Rücksicht auf Groß/Klein). */
export function findAllRanges(roots: Element[], needle: string, max = 50): Range[] {
  const q = squash(needle).toLowerCase()
  if (!q || !roots.length) return []
  const { text, at } = textMap(roots)
  const hay = text.toLowerCase()
  const out: Range[] = []
  for (let i = hay.indexOf(q); i >= 0 && out.length < max; i = hay.indexOf(q, i + q.length)) {
    const start = at[i]
    const end = at[i + q.length - 1]
    if (!start || !end) break
    const r = document.createRange()
    r.setStart(start.node, start.offset)
    r.setEnd(end.node, end.offset + 1)
    out.push(r)
  }
  return out
}

/** Absatz/Listenpunkt/Codeblock …, in dem das Zitat endet (innerhalb der Wurzeln). */
export function blockOfRange(range: Range, roots: Element[]): HTMLElement | null {
  const el = range.endContainer.parentElement?.closest<HTMLElement>(BLOCKS) ?? null
  return el && roots.some((r) => r.contains(el)) ? el : null
}

const HIGHLIGHT = 'c2-jump'
let clearTimer: ReturnType<typeof setTimeout> | null = null

/** Textbereiche wie mit einem Textmarker hervorheben (CSS Custom Highlight), nach `ms` wieder weg. */
export function highlightRange(range: Range | Range[], ms = 6500): void {
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!reg || !H) return
  const list = Array.isArray(range) ? range : [range]
  if (!list.length) return
  reg.set(HIGHLIGHT, new H(...list))
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => reg.delete(HIGHLIGHT), ms)
}
