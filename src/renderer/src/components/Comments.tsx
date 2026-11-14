import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatComment } from '@shared/types'
import { findQuoteRange } from '../textRange'
import { useStore } from '../store'
import { Icon } from './Icon'

/**
 * Notizen am Rand („wie in Word“): eigene Ebene neben dem Verlauf, die CLI sieht sie nicht.
 * Jede Notiz hängt an einem Transkript-Eintrag, meist an einer markierten Stelle darin; sie steht
 * rechts daneben, auf Höhe ihrer Stelle. Überlappungen rutschen nach unten.
 */

const WIDTH = 230
const GAP = 8

interface Placed {
  comment: ChatComment
  top: number
  /** Höhe der markierten Stelle (für den Strich). */
  anchorHeight: number
  found: boolean
}

export function CommentLayer({ chatId, innerRef }: { chatId: string; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const comments = useStore((s) => s.comments[chatId])
  const transcript = useStore((s) => s.transcripts[chatId])
  const editing = useStore((s) => s.editingComment)
  const [placed, setPlaced] = useState<Placed[]>([])
  const heights = useRef(new Map<string, number>())

  useEffect(() => void useStore.getState().ensureComments(chatId), [chatId])

  // Lage der Notizen bestimmen: Position der Stelle im Text, dann Überlappungen auflösen.
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || !comments?.length) {
      setPlaced([])
      return
    }
    const measure = (): void => {
      const base = inner.getBoundingClientRect().top
      const anchors: Placed[] = []
      for (const c of comments) {
        const unit = inner.querySelector<HTMLElement>(`.unit[data-item-id="${CSS.escape(c.itemId)}"]`)
        if (!unit) continue
        const range = c.quote ? findQuoteRange([unit], c.quote) : null
        const r = range?.getBoundingClientRect() ?? unit.getBoundingClientRect()
        const box = r.height ? r : unit.getBoundingClientRect()
        anchors.push({ comment: c, top: box.top - base, anchorHeight: box.height, found: !c.quote || !!range })
      }
      anchors.sort((a, b) => a.top - b.top)
      let last = -Infinity
      for (const a of anchors) {
        a.top = Math.max(a.top, last)
        last = a.top + (heights.current.get(a.comment.id) ?? 54) + GAP
      }
      setPlaced(anchors)
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
  }, [comments, transcript, innerRef, editing])

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
    <div className="comment-layer" style={{ width: WIDTH }}>
      {placed.map((p) => (
        <CommentNote
          key={p.comment.id}
          chatId={chatId}
          placed={p}
          editing={editing === p.comment.id}
          onHeight={(h) => heights.current.set(p.comment.id, h)}
        />
      ))}
    </div>
  )
}

function CommentNote({
  chatId,
  placed,
  editing,
  onHeight
}: {
  chatId: string
  placed: Placed
  editing: boolean
  onHeight: (h: number) => void
}) {
  const c = placed.comment
  const [text, setText] = useState(c.text)
  const ref = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setText(c.text), [c.text, editing])
  useLayoutEffect(() => {
    if (ref.current) onHeight(ref.current.offsetHeight)
  })
  useLayoutEffect(() => {
    if (editing) {
      area.current?.focus()
      area.current?.select()
    }
  }, [editing])

  const st = useStore.getState()
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
      ref={ref}
      className={`comment-note${editing ? ' editing' : ''}${placed.found ? '' : ' lost'}`}
      style={{ top: placed.top }}
      onClick={() => !editing && st.setEditingComment(c.id)}
      title={placed.found ? c.quote : 'Die markierte Stelle wurde nicht gefunden – die Notiz steht beim Eintrag.'}
    >
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
          {c.quote && <div className="comment-quote">{c.quote}</div>}
          <div className="comment-text">{c.text}</div>
          <div className="comment-meta muted small">{when(c.updatedAt)}</div>
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
