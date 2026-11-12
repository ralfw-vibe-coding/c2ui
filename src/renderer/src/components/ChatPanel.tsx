import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AGENTS } from '@shared/types'
import { useChat, useStore } from '../store'
import { Icon } from './Icon'
import { TranscriptItemView } from './Message'

const NEAR_BOTTOM_PX = 60
/** Entwürfe überleben das Neu-Einhängen einer Zelle (z. B. beim Teilen). */
const drafts = new Map<string, string>()

export function ChatPanel({ chatId, active }: { chatId: string; active: boolean }) {
  const transcript = useStore((s) => s.transcripts[chatId])
  const busy = useStore((s) => !!s.busy[chatId])
  const agentLabel = AGENTS[useChat(chatId)?.agent ?? 'claude'].label
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  function onScroll(): void {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    stickRef.current = near
    setAtBottom(near)
  }

  function scrollToEnd(smooth = false): void {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setAtBottom(true)
  }

  // Neue Inhalte: am Ende kleben bleiben, wenn man schon unten war.
  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd()
  }, [transcript, busy])

  return (
    <div className="chat-panel">
      <div className="transcript" ref={scrollRef} onScroll={onScroll}>
        {!transcript ? (
          <div className="muted center-hint">Lade …</div>
        ) : transcript.length === 0 ? (
          <div className="muted center-hint">Schreib die erste Nachricht.</div>
        ) : (
          transcript.map((item) => <TranscriptItemView key={item.id} item={item} />)
        )}
        {busy && (
          <div className="working">
            <span className="spinner" /> {agentLabel} arbeitet …
          </div>
        )}
      </div>
      {!atBottom && (
        <button className="to-bottom" onClick={() => scrollToEnd(true)} title="Zum Ende">
          <Icon name="down" />
        </button>
      )}
      <Composer chatId={chatId} busy={busy} autoFocus={active} agentLabel={agentLabel} />
    </div>
  )
}

function Composer({
  chatId,
  busy,
  autoFocus,
  agentLabel
}: {
  chatId: string
  busy: boolean
  autoFocus: boolean
  agentLabel: string
}) {
  const [text, setTextState] = useState(() => drafts.get(chatId) ?? '')
  const setText = (t: string): void => {
    drafts.set(chatId, t)
    setTextState(t)
  }
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Fokus nur holen, wenn der Nutzer nicht gerade woanders tippt (z. B. beim Umbenennen).
  useEffect(() => {
    const el = ref.current
    if (!autoFocus || busy || !el) return
    const ae = document.activeElement
    const typingElsewhere =
      ae instanceof HTMLElement &&
      ae !== el &&
      (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)
    if (!typingElsewhere) el.focus()
  }, [autoFocus, busy])

  // Höhe an Inhalt anpassen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const h = el.scrollHeight + 2 // + Rahmen
    el.style.height = Math.min(h, 220) + 'px'
    el.style.overflowY = h > 220 ? 'auto' : 'hidden'
  }, [text])

  async function submit(): Promise<void> {
    const t = text.trim()
    if (!t || busy) return
    setError(null)
    setText('')
    try {
      await useStore.getState().send(chatId, t)
    } catch (e) {
      setText(t)
      setError(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <div className="composer">
      {error && <div className="composer-error">{error}</div>}
      <div className="composer-row">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          placeholder={
            busy
              ? `${agentLabel} arbeitet – Eingabe gesperrt`
              : `Nachricht an ${agentLabel} … (Enter senden, Shift+Enter Zeilenumbruch)`
          }
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {busy ? (
          <button className="btn stop" onClick={() => window.api.interrupt(chatId)} title="Antwort abbrechen">
            <Icon name="stop" />
          </button>
        ) : (
          <button className="btn primary" onClick={() => void submit()} disabled={!text.trim()} title="Senden">
            <Icon name="send" />
          </button>
        )}
      </div>
    </div>
  )
}
