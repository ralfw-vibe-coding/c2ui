import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { cleanQuote, splitQuotes, type QuoteRef } from '@shared/quotes'
import { useStore } from '../store'
import { Icon } from './Icon'

const OVERLAY_WIDTH = 340

interface Sel {
  quote: string
  /** Position relativ zum Chat-Panel */
  left: number
  top?: number
  bottom?: number
}

/**
 * Markierter Text im Chat → kleines Overlay: „Bezug nehmen“, dann Anmerkung tippen.
 * Übernehmen legt Zitat + Anmerkung als Chip ins Eingabefeld; „In neuem Chat fragen“ zweigt einen Chat ab.
 */
export function QuoteSelection({ chatId, scrollRef }: { chatId: string; scrollRef: RefObject<HTMLDivElement | null> }) {
  const [sel, setSel] = useState<Sel | null>(null)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const editingRef = useRef(false)
  editingRef.current = editing

  const close = (): void => {
    setSel(null)
    setEditing(false)
    setNote('')
  }

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const panel = root.closest('.chat-panel') as HTMLElement | null
    const onUp = (): void => {
      // Erst nach dem Klick steht die Auswahl fest.
      setTimeout(() => {
        const s = window.getSelection()
        if (!s || s.isCollapsed || s.rangeCount === 0) return
        const range = s.getRangeAt(0)
        if (!root.contains(range.commonAncestorContainer)) return
        const quote = cleanQuote(s.toString())
        if (!quote || !panel) return
        const r = range.getBoundingClientRect()
        const pr = panel.getBoundingClientRect()
        const left = Math.max(8, Math.min(r.left + r.width / 2 - pr.left - 70, pr.width - OVERLAY_WIDTH - 8))
        // Unten zu wenig Platz → über der Markierung anzeigen.
        const below = r.bottom - pr.top + 6
        const next: Sel = below > pr.height - 200 ? { quote, left, bottom: pr.bottom - r.top + 6 } : { quote, left, top: below }
        setSel(next)
        setEditing(false)
        setNote('')
      }, 0)
    }
    const onDown = (e: MouseEvent): void => {
      if (boxRef.current?.contains(e.target as Node)) return
      close()
    }
    const onScroll = (): void => {
      if (!editingRef.current) setSel(null)
    }
    root.addEventListener('mouseup', onUp)
    document.addEventListener('mousedown', onDown)
    root.addEventListener('scroll', onScroll)
    return () => {
      root.removeEventListener('mouseup', onUp)
      document.removeEventListener('mousedown', onDown)
      root.removeEventListener('scroll', onScroll)
    }
  }, [scrollRef])

  useLayoutEffect(() => {
    if (editing) noteRef.current?.focus()
  }, [editing])

  if (!sel) return null
  const pos = { left: sel.left, ...(sel.top !== undefined ? { top: sel.top } : { bottom: sel.bottom }) }

  const take = (): void => {
    useStore.getState().addRef(chatId, sel.quote, note)
    window.getSelection()?.removeAllRanges()
    close()
    // Weiter im Eingabefeld des Chats
    requestAnimationFrame(() =>
      (document.querySelector(`[data-chat-id="${CSS.escape(chatId)}"] .composer textarea`) as HTMLTextAreaElement | null)?.focus()
    )
  }
  const fork = (): void => {
    void useStore.getState().askInNewChat(chatId, sel.quote, note)
    window.getSelection()?.removeAllRanges()
    close()
  }

  if (!editing) {
    return (
      <div className="quote-pill" ref={boxRef} style={pos}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(true)}
          title="Auf die markierte Stelle Bezug nehmen"
        >
          <Icon name="quote" size={14} /> Bezug nehmen
        </button>
      </div>
    )
  }

  return (
    <div className="quote-box" ref={boxRef} style={{ ...pos, width: OVERLAY_WIDTH }}>
      <div className="quote-box-quote" title={sel.quote}>
        {sel.quote}
      </div>
      <textarea
        ref={noteRef}
        rows={2}
        value={note}
        placeholder="Anmerkung oder Frage dazu (optional)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            close()
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (e.metaKey || e.ctrlKey) fork()
            else take()
          }
        }}
      />
      <div className="quote-box-actions">
        <button className="btn" onClick={fork} title="Neuer Chat mit dem bisherigen Verlauf, daneben geöffnet (⌘↩)">
          In neuem Chat fragen
        </button>
        <button className="btn primary" onClick={take} title="Ins Eingabefeld übernehmen (↩)">
          Übernehmen
        </button>
      </div>
    </div>
  )
}

/** Gesammelte Bezüge über dem Eingabefeld (noch nicht gesendet). */
export function RefChips({ chatId, refs }: { chatId: string; refs: QuoteRef[] }) {
  return (
    <div className="ref-row">
      {refs.map((r) => (
        <div key={r.id} className="ref-chip" title={r.note ? `${r.quote}\n\n→ ${r.note}` : r.quote}>
          <Icon name="quote" size={13} />
          <span className="ref-quote">{r.quote}</span>
          {r.note && <span className="ref-note">{r.note}</span>}
          <button className="icon-btn" title="Bezug entfernen" onClick={() => useStore.getState().removeRef(chatId, r.id)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Text einer Nutzernachricht mit abgesetzten Zitaten. */
export function UserText({ text }: { text: string }) {
  if (!/^>/m.test(text)) return <>{text}</>
  return (
    <>
      {splitQuotes(text).map((p, i) =>
        p.kind === 'quote' ? (
          <div key={i} className="bubble-quote">
            {p.text}
          </div>
        ) : (
          <div key={i}>{p.text}</div>
        )
      )}
    </>
  )
}
