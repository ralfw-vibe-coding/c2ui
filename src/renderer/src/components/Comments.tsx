import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatComment } from '@shared/types'
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
/** Abstand zweier Marken an derselben Stelle. */
const PIN_GAP = 20

interface Pin {
  comment: ChatComment
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
  const transcript = useStore((s) => s.transcripts[chatId])
  const editing = useStore((s) => s.editingComment)
  const [pins, setPins] = useState<Pin[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const inner = useInner(innerRef)

  useEffect(() => void useStore.getState().ensureComments(chatId), [chatId])

  // Eine frisch angelegte Notiz ist gleich offen (sie wird ja gerade geschrieben).
  useEffect(() => {
    if (editing && comments?.some((c) => c.id === editing)) setOpen(editing)
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

  // Lage bestimmen: hinter das Ende der markierten Stelle, umgerechnet in Koordinaten der Ebene.
  const measure = useCallback((): void => {
    if (!inner || !comments?.length) {
      setPins([])
      return
    }
    const base = inner.getBoundingClientRect()
    const list: Pin[] = []
    for (const c of comments) {
      const unit = inner.querySelector<HTMLElement>(`.unit[data-item-id="${CSS.escape(c.itemId)}"]`)
      if (!unit) continue
      const range = c.quote ? findQuoteRange([unit], c.quote) : null
      // Bei mehrzeiligen Stellen zählt die letzte Zeile der Stelle.
      const rects = range ? [...range.getClientRects()].filter((r) => r.width || r.height) : []
      const box = rects.length ? rects[rects.length - 1] : unit.getBoundingClientRect()
      list.push({
        comment: c,
        left: lineEnd(range, box, unit) - base.left + 4,
        top: box.top - base.top + box.height / 2 - PIN / 2,
        found: !c.quote || !!range
      })
    }
    list.sort((a, b) => a.top - b.top || a.left - b.left)
    // Marken an derselben Stelle nebeneinander statt übereinander.
    for (let i = 1; i < list.length; i++) {
      const p = list[i]
      const q = list[i - 1]
      if (Math.abs(p.top - q.top) < PIN && p.left < q.left + PIN_GAP) p.left = q.left + PIN_GAP
    }
    const max = Math.max(0, base.width - PIN - 2)
    for (const p of list) p.left = Math.min(Math.max(0, p.left), max)
    setPins(list)
  }, [comments, inner])

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

  if (!comments?.length) return null
  return (
    <div className="comment-layer" ref={layerRef}>
      {pins.map((p) => (
        <span key={p.comment.id}>
          <button
            className={`comment-pin${p.found ? '' : ' lost'}${open === p.comment.id ? ' on' : ''}`}
            style={{ left: p.left, top: p.top }}
            title={p.comment.text || 'Notiz'}
            onClick={() => setOpen(open === p.comment.id ? null : p.comment.id)}
          >
            <Icon name="note" size={11} />
          </button>
          {open === p.comment.id && (
            <CommentCard
              chatId={chatId}
              pin={p}
              inner={inner}
              editing={editing === p.comment.id}
              onClose={() => setOpen(null)}
            />
          )}
        </span>
      ))}
    </div>
  )
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
  const c = pin.comment
  const [text, setText] = useState(c.text)
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)
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

  // Das Feld liegt bei der Marke – aber immer im sichtbaren Teil der Zelle: unter der Stelle,
  // und wenn dort kein Platz ist, darüber.
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
  }, [pin.left, pin.top, inner, editing, text])

  const save = (): void => void st.updateComment(chatId, c.id, text)
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
