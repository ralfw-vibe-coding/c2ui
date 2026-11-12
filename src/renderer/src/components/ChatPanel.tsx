import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chatSurfaces } from '../a2ui/chatSurfaces'
import { scrollToSurface } from '../a2ui/A2uiBlock'
import { ScreenStrip } from '../a2ui/ScreenStrip'
import { AGENTS } from '@shared/types'
import { useChat, useStore } from '../store'
import { Icon } from './Icon'
import { TranscriptView } from './TranscriptView'

const NEAR_BOTTOM_PX = 60
import { drafts } from '../drafts'
import { AttachmentChips } from './Attachments'
import { QuoteSelection, RefChips } from './QuoteRefs'
import { composeMessage } from '@shared/quotes'

export function ChatPanel({ chatId, active }: { chatId: string; active: boolean }) {
  const transcript = useStore((s) => s.transcripts[chatId])
  const busy = useStore((s) => !!s.busy[chatId])
  const agentLabel = AGENTS[useChat(chatId)?.agent ?? 'claude'].label
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [fileOver, setFileOver] = useState(false)

  // A2UI: neue render_ui-Aufrufe anwenden, bevor die Nachrichten gerendert werden.
  const componentsVersion = useStore((s) => s.componentsVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const freshA2ui = useMemo(() => (transcript ? chatSurfaces(chatId).sync(transcript) : []), [chatId, transcript, componentsVersion])
  const activeSurfaces = useMemo(() => chatSurfaces(chatId).activeSurfaces(), [chatId, freshA2ui]) // eslint-disable-line react-hooks/exhaustive-deps
  const seenVersion = useRef(componentsVersion)
  const a2uiReady = useRef(false)
  useEffect(() => {
    if (!transcript) return
    // Beim ersten Laden nicht springen, nur bei neuen Updates während der Sitzung.
    if (!a2uiReady.current) {
      a2uiReady.current = true
      return
    }
    // Nach einem Neuaufbau (geänderte Komponenten) nicht springen – es ist kein neues Update.
    if (seenVersion.current !== componentsVersion) {
      seenVersion.current = componentsVersion
      return
    }
    const cs = chatSurfaces(chatId)
    const updated = freshA2ui.flatMap((id) => cs.effect(id)?.updated ?? [])
    if (updated.length) {
      stickRef.current = false
      requestAnimationFrame(() => scrollToSurface(chatId, updated[updated.length - 1]))
    }
  }, [freshA2ui, chatId, transcript, componentsVersion])

  // Scroll-Ereignisse kommen asynchron. Folgt eines kurz auf einen eigenen Sprung ans Ende,
  // ist der Inhalt evtl. inzwischen gewachsen – das ist kein Wegscrollen des Nutzers.
  const programmaticUntil = useRef(0)

  function onScroll(): void {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (!near && stickRef.current && performance.now() < programmaticUntil.current) {
      scrollToEnd()
      return
    }
    stickRef.current = near
    setAtBottom(near)
  }

  function scrollToEnd(smooth = false): void {
    const el = scrollRef.current
    if (!el) return
    programmaticUntil.current = performance.now() + (smooth ? 900 : 200)
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setAtBottom(true)
  }

  // Neue Inhalte: am Ende kleben bleiben, wenn man schon unten war.
  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd()
  }, [transcript, busy])

  // Screens und Charts wachsen erst nach dem ersten Layout (Web Components, Messung der Charts).
  // Wächst der Inhalt und man klebt am Ende, bleibt man dort.
  const innerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToEnd()
    })
    ro.observe(el)
    // Auch der sichtbare Bereich kann schrumpfen (z. B. wenn die Screen-Leiste erscheint).
    if (scrollRef.current) ro.observe(scrollRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className={`chat-panel${fileOver ? ' file-over' : ''}`}
      data-chat-id={chatId}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!fileOver) setFileOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setFileOver(false)
        void useStore.getState().addFiles(chatId, [...e.dataTransfer.files])
      }}
    >
      {fileOver && <div className="file-drop-hint">Dateien hier ablegen, um sie anzuhängen</div>}
      <ScreenStrip chatId={chatId} surfaceIds={activeSurfaces} />
      <QuoteSelection chatId={chatId} scrollRef={scrollRef} />
      <div className="transcript" ref={scrollRef} onScroll={onScroll}>
        <div className="transcript-inner" ref={innerRef}>
        {!transcript ? (
          <div className="muted center-hint">Lade …</div>
        ) : transcript.length === 0 ? (
          <div className="muted center-hint">Schreib die erste Nachricht.</div>
        ) : (
          <TranscriptView chatId={chatId} transcript={transcript} busy={busy} />
        )}
        {busy && (
          <div className="working">
            <span className="spinner" /> {agentLabel} arbeitet …
          </div>
        )}
        </div>
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

  const attachments = useStore((s) => s.pendingAttachments[chatId]) ?? []
  const refs = useStore((s) => s.pendingRefs[chatId]) ?? []
  const canSend = !!text.trim() || attachments.length > 0 || refs.length > 0

  async function submit(): Promise<void> {
    const t = text.trim()
    if (!canSend || busy) return
    setError(null)
    setText('')
    const sent = attachments
    useStore.getState().clearAttachments(chatId)
    const sentRefs = useStore.getState().takeRefs(chatId)
    try {
      await useStore.getState().send(chatId, composeMessage(sentRefs, t), sent)
    } catch (e) {
      setText(t)
      useStore.getState().restoreRefs(chatId, sentRefs)
      for (const a of sent) useStore.setState((st) => ({ pendingAttachments: { ...st.pendingAttachments, [chatId]: [...(st.pendingAttachments[chatId] ?? []), a] } }))
      setError(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const files = [...e.clipboardData.files]
    if (!files.length) return
    e.preventDefault()
    const errors = await useStore.getState().addFiles(chatId, files)
    if (errors.length) setError(errors.join(' · '))
  }

  return (
    <div className="composer">
      {error && <div className="composer-error">{error}</div>}
      {refs.length > 0 && <RefChips chatId={chatId} refs={refs} />}
      {attachments.length > 0 && <AttachmentChips chatId={chatId} attachments={attachments} />}
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
          onPaste={(e) => void onPaste(e)}
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
          <button className="btn primary" onClick={() => void submit()} disabled={!canSend} title="Senden">
            <Icon name="send" />
          </button>
        )}
      </div>
    </div>
  )
}
