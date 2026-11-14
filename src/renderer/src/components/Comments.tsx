import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatComment } from '@shared/types'
import { findQuoteRange } from '../textRange'
import { useStore } from '../store'
import { Icon } from './Icon'

/**
 * Notizen am Rand („wie in Word“): eigene Ebene neben dem Verlauf, die CLI sieht sie nicht.
 * Am Rand steht zunächst nur ein Zettel-Symbol auf Höhe der Stelle; ein Klick klappt die Notiz auf –
 * dann lässt sie sich lesen, ändern und löschen wie beim Anlegen.
 */

const CARD = 250
const GAP = 6
/** Geschätzte Höhe eines eingeklappten Symbols (für das Auseinanderrücken). */
const ICON_H = 24

interface Placed {
  comment: ChatComment
  top: number
  /** Die markierte Stelle wurde im Text wiedergefunden. */
  found: boolean
}

export function CommentLayer({ chatId, innerRef }: { chatId: string; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const comments = useStore((s) => s.comments[chatId])
  const transcript = useStore((s) => s.transcripts[chatId])
  const editing = useStore((s) => s.editingComment)
  const [placed, setPlaced] = useState<Placed[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => void useStore.getState().ensureComments(chatId), [chatId])

  // Eine frisch angelegte Notiz ist gleich offen (sie wird ja gerade geschrieben).
  useEffect(() => {
    if (editing && comments?.some((c) => c.id === editing)) setOpen(editing)
  }, [editing, comments])

  // Klick außerhalb klappt wieder ein (eine Notiz im Schreiben bleibt offen).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (layerRef.current?.contains(e.target as Node)) return
      if (useStore.getState().editingComment === open) return
      setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Lage bestimmen: Höhe der markierten Stelle im Text, dann Überlappungen auflösen.
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !comments?.length) {
      setPlaced([])
      return
    }
    const measure = (): void => {
      const base = inner.getBoundingClientRect().top
      const list: Placed[] = []
      for (const c of comments) {
        const unit = inner.querySelector<HTMLElement>(`.unit[data-item-id="${CSS.escape(c.itemId)}"]`)
        if (!unit) continue
        const range = c.quote ? findQuoteRange([unit], c.quote) : null
        const box = range?.getBoundingClientRect() ?? unit.getBoundingClientRect()
        list.push({ comment: c, top: (box.height ? box.top : unit.getBoundingClientRect().top) - base, found: !c.quote || !!range })
      }
      list.sort((a, b) => a.top - b.top)
      let last = -Infinity
      for (const p of list) {
        p.top = Math.max(p.top, last)
        last = p.top + ICON_H + GAP
      }
      setPlaced(list)
    }
    measure()
    // Bilder, Screens und Markdown kommen verzögert: noch einmal nachmessen und bei Größenänderung.
    const t = setTimeout(measure, 400)
    const ro = new ResizeObserver(measure)
    ro.observe(inner)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [comments, transcript, innerRef])

  // Markierte Stellen im Text dauerhaft unterlegen.
  useEffect(() => {
    const inner = innerRef.current
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
  }, [chatId, comments, transcript, innerRef, placed.length])

  if (!comments?.length) return null
  return (
    <div className="comment-layer" ref={layerRef}>
      {placed.map((p) =>
        open === p.comment.id ? (
          <CommentCard key={p.comment.id} chatId={chatId} placed={p} editing={editing === p.comment.id} onClose={() => setOpen(null)} />
        ) : (
          <button
            key={p.comment.id}
            className={`comment-dot${p.found ? '' : ' lost'}`}
            style={{ top: p.top }}
            title={p.comment.text}
            onClick={() => setOpen(p.comment.id)}
          >
            <Icon name="note" size={13} />
          </button>
        )
      )}
    </div>
  )
}

function CommentCard({
  chatId,
  placed,
  editing,
  onClose
}: {
  chatId: string
  placed: Placed
  editing: boolean
  onClose: () => void
}) {
  const c = placed.comment
  const [text, setText] = useState(c.text)
  const area = useRef<HTMLTextAreaElement>(null)
  const st = useStore.getState()

  useEffect(() => setText(c.text), [c.text, editing])
  useLayoutEffect(() => {
    if (editing) {
      area.current?.focus()
      area.current?.select()
    }
  }, [editing])

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
      className={`comment-note${editing ? ' editing' : ''}${placed.found ? '' : ' lost'}`}
      style={{ top: placed.top, width: CARD }}
      title={placed.found ? undefined : 'Die markierte Stelle wurde nicht gefunden – die Notiz steht beim Eintrag.'}
    >
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
              if (e.key === 'Escape') (e.preventDefault(), cancel())
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
            <button className="btn small-btn" onClick={onClose} title="Einklappen">
              Schließen
            </button>
          </div>
        </>
      )}
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
