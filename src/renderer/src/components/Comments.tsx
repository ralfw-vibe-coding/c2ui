import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Bookmark, ChatComment } from '@shared/types'
import { cleanQuote, MAX_QUOTE } from '@shared/quotes'
import { findQuoteRange } from '../textRange'
import { useStore } from '../store'
import { Icon } from './Icon'

/**
 * Notizen zu Stellen im Verlauf („wie in Word“): eigene Ebene über dem Verlauf, die CLI sieht sie nicht.
 * Die Marke steht direkt hinter der markierten Stelle im Text; ein Klick darauf klappt die Notiz auf –
 * dann lässt sie sich lesen, ändern und löschen wie beim Anlegen. Das Feld wird so gelegt, dass es
 * sichtbar bleibt, egal ob die Stelle oben oder unten in der Zelle steht.
 */

const CARD = 250
const PIN = 18
/** Absätze eines Eintrags: an jedem lässt sich ein Lesezeichen setzen, nicht nur am Anfang des Turns. */
const BLOCKS = 'p, li, blockquote, pre, table, h1, h2, h3, h4, h5, h6'
interface Pin {
  /** Notiz oder Lesezeichen – beide hängen an derselben Stelle im Text. */
  kind: 'note' | 'bookmark'
  id: string
  itemId: string
  quote?: string
  /** Das Zitat ist ein ganzer Absatz: die Marke steht an seinem Anfang. */
  block?: boolean
  comment?: ChatComment
  bookmark?: Bookmark
  /** Lage in der Ebene (= Innenfläche des Verlaufs). */
  left: number
  top: number
  /** Die markierte Stelle wurde im Text wiedergefunden. */
  found: boolean
}

/**
 * Das Element, auf das die Ebene sich bezieht. React setzt eine Ref erst, nachdem die Effekte der
 * Kinder gelaufen sind – beim ersten Lauf ist `innerRef.current` darum noch leer. Früher hieß das:
 * keine Marken, bis sich sonst etwas rührt (z. B. beim Öffnen in einer zweiten Zelle). Deshalb wird
 * hier notfalls im nächsten Frame noch einmal nachgesehen.
 */
function useInner(innerRef: React.RefObject<HTMLDivElement | null>): HTMLDivElement | null {
  const [el, setEl] = useState<HTMLDivElement | null>(innerRef.current)
  useLayoutEffect(() => {
    let frame = 0
    const look = (): void => {
      const now = innerRef.current
      if (now) setEl((old) => (old === now ? old : now))
      else frame = requestAnimationFrame(look)
    }
    look()
    return () => cancelAnimationFrame(frame)
  }, [innerRef])
  return el
}

export function CommentLayer({ chatId, innerRef }: { chatId: string; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const comments = useStore((s) => s.comments[chatId])
  const bookmarks = useStore((s) => s.bookmarks[chatId])
  const transcript = useStore((s) => s.transcripts[chatId])
  const editing = useStore((s) => s.editingComment)
  const [pins, setPins] = useState<Pin[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [hover, setHover] = useState<{ itemId: string; top: number; blockTop: number; quote?: string } | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const inner = useInner(innerRef)

  useEffect(() => {
    useStore.getState().ensureComments(chatId)
    useStore.getState().ensureBookmarks(chatId)
  }, [chatId])

  // Eine frisch angelegte Notiz ist gleich offen (sie wird ja gerade geschrieben);
  // eine gelöschte oder verworfene gilt als eingeklappt.
  useEffect(() => {
    if (editing && comments?.some((c) => c.id === editing)) setOpen(editing)
    else setOpen((o) => (o && !comments?.some((c) => c.id === o) ? null : o))
  }, [editing, comments])

  // Klick daneben und Escape klappen wieder ein (eine Notiz im Schreiben bleibt offen).
  useEffect(() => {
    if (!open) return
    const zu = (): void => {
      if (useStore.getState().editingComment !== open) setOpen(null)
    }
    const onDown = (e: MouseEvent): void => {
      if (!layerRef.current?.contains(e.target as Node)) zu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') zu()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])


  // Notiz ohne Markierung: Wer einen Eintrag überfährt, bekommt oben rechts einen Knopf dafür.
  useEffect(() => {
    if (!inner) return
    const onOver = (e: MouseEvent): void => {
      // Über der Ebene selbst (Knopf, Marken, offene Notiz) bleibt es beim zuletzt überfahrenen Eintrag,
      // sonst wäre der Knopf weg, sobald die Maus ihn erreicht.
      if ((e.target as HTMLElement | null)?.closest('.comment-layer')) return
      const el = e.target as HTMLElement | null
      const unit = el?.closest<HTMLElement>('.unit[data-item-id]')
      const itemId = unit?.dataset.itemId
      if (!unit || !itemId) return setHover(null)
      const base = inner.getBoundingClientRect()
      const top = unitBox(unit).top - base.top + 2
      // Absatz unter der Maus: so lässt sich auch mitten in einer Antwort ein Lesezeichen setzen.
      const block = el?.closest<HTMLElement>(BLOCKS)
      const box = block && unit.contains(block) ? block.getBoundingClientRect() : null
      const blockTop = box ? box.top - base.top + 2 : top
      const text = box && blockTop > top + 4 ? cleanQuote(block!.innerText).slice(0, MAX_QUOTE) : ''
      const quote = text || undefined
      setHover((h) =>
        h?.itemId === itemId && h.quote === quote && Math.abs(h.top - top) < 1 && Math.abs(h.blockTop - blockTop) < 1
          ? h
          : { itemId, top, blockTop, quote }
      )
    }
    const onLeave = (): void => setHover(null)
    inner.addEventListener('mousemove', onOver)
    inner.addEventListener('mouseleave', onLeave)
    return () => {
      inner.removeEventListener('mousemove', onOver)
      inner.removeEventListener('mouseleave', onLeave)
    }
  }, [inner])

  /**
   * Die Knöpfe zum Anlegen: die Notiz oben am Eintrag, das Lesezeichen am Anfang des überfahrenen
   * Absatzes. Beide stellen sich unter die Marken, die dort schon stehen; stehen sie auf derselben
   * Höhe, rückt das Lesezeichen daneben.
   */
  const addAt = useMemo(() => {
    if (!hover || !inner) return null
    const right = inner.getBoundingClientRect().width - PIN - 2
    const frei = (top: number): number => {
      let t = top
      for (const p of pins) if (Math.abs(p.left - right) < PIN && p.top >= t - 2 && p.top < t + PIN + 1) t = p.top + PIN + 2
      return t
    }
    const note = { left: right, top: frei(hover.top) }
    const mark = hover.quote ? { left: right, top: frei(hover.blockTop) } : { left: right - PIN - 2, top: note.top }
    if (mark.left === note.left && Math.abs(mark.top - note.top) < PIN + 2) {
      mark.left = note.left - PIN - 2
      mark.top = note.top
    }
    return { note, mark }
  }, [hover, pins, inner])

  // Lage bestimmen: hinter das Ende der markierten Stelle, umgerechnet in Koordinaten der Ebene.
  const measure = useCallback((): void => {
    const marken: Pin[] = [
      ...(comments ?? []).map((c) => ({ kind: 'note' as const, id: c.id, itemId: c.itemId, quote: c.quote, comment: c, left: 0, top: 0, found: true })),
      ...(bookmarks ?? []).map((b) => ({
        kind: 'bookmark' as const,
        id: b.id,
        itemId: b.itemId,
        quote: b.quote,
        block: b.block,
        bookmark: b,
        left: 0,
        top: 0,
        found: true
      }))
    ]
    if (!inner || !marken.length) {
      setPins([])
      return
    }
    const base = inner.getBoundingClientRect()
    const list: Pin[] = []
    for (const m of marken) {
      const unit = inner.querySelector<HTMLElement>(`.unit[data-item-id="${CSS.escape(m.itemId)}"]`)
      if (!unit) continue
      const range = m.quote ? findQuoteRange([unit], m.quote) : null
      if (!m.quote || (m.block && !range)) {
        // Marke zum ganzen Eintrag: oben rechts, dort, wo auch der Knopf zum Anlegen steht.
        // Ein Absatz, der nicht mehr da ist, fällt auf diese Stelle zurück.
        const box = unitBox(unit)
        list.push({ ...m, left: base.width - PIN - 2, top: box.top - base.top + 2, found: !m.quote })
        continue
      }
      if (m.block && range) {
        // Lesezeichen an einem Absatz: rechts auf Höhe seiner ersten Zeile.
        const erste = [...range.getClientRects()].filter((r) => r.width || r.height)[0]
        const box = erste ?? unitBox(unit)
        list.push({ ...m, left: base.width - PIN - 2, top: box.top - base.top + 2, found: true })
        continue
      }
      // Bei mehrzeiligen Stellen zählt die letzte Zeile der Stelle.
      const rects = range ? [...range.getClientRects()].filter((r) => r.width || r.height) : []
      const box = rects.length ? rects[rects.length - 1] : unitBox(unit)
      list.push({
        ...m,
        left: lineEnd(range, box, unit) - base.left + 4,
        top: box.top - base.top + box.height / 2 - PIN / 2,
        found: !!range
      })
    }
    list.sort((a, b) => a.top - b.top || a.left - b.left)
    // Marken an derselben Stelle untereinander statt übereinander.
    for (let i = 1; i < list.length; i++) {
      const p = list[i]
      const q = list[i - 1]
      if (Math.abs(p.left - q.left) < PIN && p.top < q.top + PIN + 1) p.top = q.top + PIN + 2
    }
    const max = Math.max(0, base.width - PIN - 2)
    for (const p of list) p.left = Math.min(Math.max(0, p.left), max)
    setPins(list)
  }, [comments, bookmarks, inner])

  // Nachmessen, wenn sich am Verlauf etwas tut: Markdown, Bilder und Screens kommen verzögert,
  // und die Breite der Zelle ändert sich jederzeit.
  useLayoutEffect(() => {
    if (!inner) return
    let frame = 0
    const bald = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const ro = new ResizeObserver(bald)
    ro.observe(inner)
    const mo = new MutationObserver(bald)
    mo.observe(inner, { childList: true, subtree: true, characterData: true })
    const t = setTimeout(measure, 500)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(t)
      ro.disconnect()
      mo.disconnect()
    }
  }, [measure, transcript, inner])

  // Markierte Stellen im Text dauerhaft unterlegen.
  useEffect(() => {
    if (!inner) return
    setCommentRanges(
      chatId,
      (comments ?? []).flatMap((c) => {
        if (!c.quote) return []
        const unit = inner.querySelector<HTMLElement>(`.unit[data-item-id="${CSS.escape(c.itemId)}"]`)
        const range = unit && findQuoteRange([unit], c.quote)
        return range ? [range] : []
      })
    )
    return () => setCommentRanges(chatId, [])
  }, [chatId, comments, transcript, inner, pins.length])

  const neueNotiz = (): void => {
    if (hover) void useStore.getState().addComment(chatId, { itemId: hover.itemId })
  }
  const neuesLesezeichen = (): void => {
    if (hover) void useStore.getState().addBookmark(chatId, { itemId: hover.itemId, ...(hover.quote ? { quote: hover.quote, block: true } : {}) })
  }

  if (!comments?.length && !bookmarks?.length && !addAt) return null
  return (
    <div className="comment-layer" ref={layerRef}>
      {addAt && !open && (
        <>
          <button
            className="comment-add"
            style={{ left: addAt.note.left, top: addAt.note.top }}
            title="Notiz zu diesem Eintrag (geht nicht an die CLI)"
            onClick={neueNotiz}
          >
            <Icon name="note" size={11} />
          </button>
          <button
            className="comment-add bookmark"
            style={{ left: addAt.mark.left, top: addAt.mark.top }}
            title={hover?.quote ? 'Lesezeichen für diesen Absatz' : 'Lesezeichen für diesen Eintrag'}
            onClick={neuesLesezeichen}
          >
            <Icon name="bookmark-plus" size={11} />
          </button>
        </>
      )}
      {pins.map((p) =>
        p.kind === 'bookmark' ? (
          <span key={p.id}>
            <button
              className={`bookmark-pin${p.found ? '' : ' lost'}${open === p.id ? ' on' : ''}`}
              style={{ left: p.left, top: p.top }}
              title={p.bookmark?.label || p.quote || 'Lesezeichen'}
              onClick={() => setOpen(open === p.id ? null : p.id)}
            >
              <Icon name="bookmark" size={11} />
            </button>
            {open === p.id && <BookmarkCard chatId={chatId} pin={p} inner={inner} onClose={() => setOpen(null)} />}
          </span>
        ) : (
          <span key={p.id}>
            <button
              className={`comment-pin${p.found ? '' : ' lost'}${open === p.id ? ' on' : ''}`}
              style={{ left: p.left, top: p.top }}
              title={p.comment?.text || 'Notiz'}
              onClick={() => setOpen(open === p.id ? null : p.id)}
            >
              <Icon name="note" size={11} />
            </button>
            {open === p.id && (
              <CommentCard chatId={chatId} pin={p} inner={inner} editing={editing === p.id} onClose={() => setOpen(null)} />
            )}
          </span>
        )
      )}
    </div>
  )
}

/**
 * Lage einer aufgeklappten Karte: bei der Marke, aber immer im sichtbaren Teil der Zelle –
 * unter der Stelle, und wenn dort kein Platz ist, darüber.
 */
function useCardPlace(
  card: React.RefObject<HTMLDivElement | null>,
  inner: HTMLDivElement | null,
  pin: Pin,
  dep: unknown
): { left: number; top: number; width: number } | null {
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = card.current
    if (!inner || !el) return
    const place = (): void => {
      const scroller = inner.closest<HTMLElement>('.transcript')
      const base = inner.getBoundingClientRect()
      const width = Math.min(CARD, Math.max(140, base.width - 8))
      // Sichtbarer Bereich, in Koordinaten der Ebene.
      const view = scroller?.getBoundingClientRect()
      const top0 = view ? view.top - base.top + 4 : 0
      const top1 = view ? view.bottom - base.top - 4 : base.height
      const h = el.offsetHeight
      let top = pin.top + PIN + 4
      if (top + h > top1) top = pin.top - h - 4
      top = Math.min(Math.max(top, top0), Math.max(top0, top1 - h))
      const left = Math.min(Math.max(pin.left - 6, 0), Math.max(0, base.width - width))
      setBox({ left, top, width })
    }
    place()
    const scroller = inner.closest<HTMLElement>('.transcript')
    scroller?.addEventListener('scroll', place)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => {
      scroller?.removeEventListener('scroll', place)
      ro.disconnect()
    }
  }, [card, pin.left, pin.top, inner, dep])
  return box
}

function CommentCard({
  chatId,
  pin,
  inner,
  editing,
  onClose
}: {
  chatId: string
  pin: Pin
  inner: HTMLDivElement | null
  editing: boolean
  onClose: () => void
}) {
  const c = pin.comment!
  const [text, setText] = useState(c.text)
  const area = useRef<HTMLTextAreaElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const st = useStore.getState()

  useEffect(() => setText(c.text), [c.text, editing])
  useLayoutEffect(() => {
    if (editing) {
      area.current?.focus()
      area.current?.select()
    }
  }, [editing])

  const box = useCardPlace(card, inner, pin, editing ? text : c.text)

  const save = (): void => void st.updateComment(chatId, c.id, text)
  // Die Notiz wird zur Frage an den Agenten: Stelle als Zitat, Notiztext als Anmerkung.
  const alsBezug = (): void => {
    st.addRef(chatId, quoteOfComment(chatId, c), c.text)
    onClose()
    requestAnimationFrame(() =>
      (document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"] .composer textarea`) as HTMLTextAreaElement | null)?.focus()
    )
  }
  const cancel = (): void => {
    // Eine neue Notiz ohne Text verschwindet wieder.
    if (!c.text.trim()) void st.removeComment(chatId, c.id)
    else {
      setText(c.text)
      st.setEditingComment(null)
    }
  }

  return (
    <div
      ref={card}
      className={`comment-note${editing ? ' editing' : ''}${pin.found ? '' : ' lost'}`}
      // Vor dem Messen unsichtbar, aber nicht „visibility: hidden“ – sonst lässt sich das Feld nicht ansteuern.
      style={box ? { left: box.left, top: box.top, width: box.width } : { left: pin.left, top: pin.top, width: CARD, opacity: 0 }}
      title={pin.found ? undefined : 'Die markierte Stelle wurde nicht gefunden – die Notiz steht beim Eintrag.'}
    >
      <button className="icon-btn comment-close" title="Schließen (Esc)" onClick={onClose}>
        <Icon name="close" size={12} />
      </button>
      {c.quote && <div className="comment-quote">{c.quote}</div>}
      {editing ? (
        <>
          <textarea
            ref={area}
            rows={3}
            value={text}
            placeholder="Notiz …"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), cancel())
              else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), save())
            }}
          />
          <div className="comment-actions">
            <button className="icon-btn comment-delete" title="Notiz löschen" onClick={() => void st.removeComment(chatId, c.id)}>
              <Icon name="trash" size={13} />
            </button>
            <button className="btn small-btn" onClick={cancel}>
              Abbrechen
            </button>
            <button className="btn primary small-btn" onClick={save} title="Speichern (⌘↩)">
              Speichern
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="comment-text" onClick={() => st.setEditingComment(c.id)} title="Zum Ändern klicken">
            {c.text}
          </div>
          <div className="comment-actions">
            <button className="icon-btn comment-delete" title="Notiz löschen" onClick={() => void st.removeComment(chatId, c.id)}>
              <Icon name="trash" size={13} />
            </button>
            <button className="icon-btn" title="Als Bezug ins Eingabefeld übernehmen" onClick={alsBezug}>
              <Icon name="quote" size={13} />
            </button>
            <span className="comment-meta muted small">{when(c.updatedAt)}</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Wo endet der Text der Zeile, in der die markierte Stelle aufhört? Dort steht die Marke –
 * so verdeckt sie nichts, bleibt aber auf der Höhe der Stelle.
 */
/**
 * Maße eines Eintrags. `.unit` ist `display: contents` – das Element selbst hat keinen Kasten
 * (`getBoundingClientRect()` liefert Nullen), also zählen die Kästen seiner Kinder.
 */
function unitBox(unit: HTMLElement): DOMRect {
  const own = unit.getBoundingClientRect()
  if (own.width || own.height) return own
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const el of unit.children) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    top = Math.min(top, r.top)
    left = Math.min(left, r.left)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  return Number.isFinite(top) ? new DOMRect(left, top, right - left, bottom - top) : own
}

function lineEnd(range: Range | null, box: DOMRect, unit: HTMLElement): number {
  if (!range) return box.right
  const node = range.endContainer
  const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) ?? unit
  const block = el.closest<HTMLElement>('p, li, td, th, blockquote, pre, h1, h2, h3, h4, h5, h6, .unit') ?? unit
  const all = document.createRange()
  all.selectNodeContents(block)
  let right = box.right
  // Alle Textstücke derselben Zeile (fett, Code, Links ergeben eigene Rechtecke).
  for (const r of all.getClientRects()) {
    if (r.bottom > box.top + 2 && r.top < box.bottom - 2 && r.right > right) right = r.right
  }
  return right
}

/**
 * Worauf sich eine Notiz bezieht, als Zitat für eine Nachricht: das markierte Zitat, sonst der
 * Anfang des Eintrags, zu dem sie gehört. So lässt sich eine Notiz zur Frage an den Agenten machen.
 */
function quoteOfComment(chatId: string, c: ChatComment): string {
  if (c.quote) return c.quote
  const item = useStore.getState().transcripts[chatId]?.find((i) => i.id === c.itemId)
  const text =
    item?.type === 'assistant'
      ? item.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      : item && 'text' in item
        ? (item as { text: string }).text
        : ''
  return cleanQuote(text).slice(0, MAX_QUOTE)
}

/**
 * Lesezeichen am Rand: Klick klappt eine kleine Karte auf – Beschriftung eintippen (optional)
 * oder das Lesezeichen wieder entfernen.
 */
function BookmarkCard({ chatId, pin, inner, onClose }: { chatId: string; pin: Pin; inner: HTMLDivElement | null; onClose: () => void }) {
  const b = pin.bookmark!
  const [label, setLabel] = useState(b.label ?? '')
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => setLabel(b.label ?? ''), [b.label])
  const box = useCardPlace(card, inner, pin, label)

  const save = (): void => {
    void useStore.getState().labelBookmark(chatId, b.id, label)
    onClose()
  }
  return (
    <div
      ref={card}
      className="comment-note bookmark-note"
      style={box ? { left: box.left, top: box.top, width: box.width } : { left: pin.left, top: pin.top, width: CARD, opacity: 0 }}
    >
      <button className="icon-btn comment-close" title="Schließen (Esc)" onClick={onClose}>
        <Icon name="close" size={12} />
      </button>
      {b.quote && <div className="comment-quote">{b.quote}</div>}
      <input
        autoFocus
        value={label}
        placeholder="Beschriftung (optional)"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), save())
          else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), onClose())
        }}
      />
      <div className="comment-actions">
        <button
          className="icon-btn comment-delete"
          title="Lesezeichen entfernen"
          onClick={() => void useStore.getState().removeBookmark(chatId, b.id)}
        >
          <Icon name="bookmark-x" size={13} />
        </button>
        <button className="btn primary small-btn" onClick={save} title="Beschriftung übernehmen (↩)">
          Übernehmen
        </button>
      </div>
    </div>
  )
}

function when(ts: number): string {
  const d = new Date(ts)
  const heute = new Date().toDateString() === d.toDateString()
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return heute ? uhr : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${uhr}`
}

// Alle unterlegten Stellen aller offenen Chats in einer Hervorhebung (CSS Custom Highlight).
const ranges = new Map<string, Range[]>()
function setCommentRanges(chatId: string, list: Range[]): void {
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!reg || !H) return
  if (list.length) ranges.set(chatId, list)
  else ranges.delete(chatId)
  const all = [...ranges.values()].flat()
  if (all.length) reg.set('c2-comment', new H(...all))
  else reg.delete('c2-comment')
}
