import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chatSurfaces } from '../a2ui/chatSurfaces'
import { scrollToSurface } from '../a2ui/A2uiBlock'
import { ScreenStrip } from '../a2ui/ScreenStrip'
import { AGENTS } from '@shared/types'
import { ipcError, useChat, useStore } from '../store'
import { Icon } from './Icon'
import { TranscriptView } from './TranscriptView'

const NEAR_BOTTOM_PX = 60
const NO_STEERING: never[] = []
import { drafts } from '../drafts'
import { AttachmentChips } from './Attachments'
import { QuoteSelection, RefChips } from './QuoteRefs'
import { composeMessage } from '@shared/quotes'
import { EMPTY_QUEUE, shouldQueue } from '@shared/queue'
import { QueueList } from './QueueList'
import { findQuoteRange, highlightRange } from '../textRange'

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

  // Welcher Turn steht oben im sichtbaren Bereich? (Das Board markiert ihn.)
  const viewRaf = useRef(0)
  const trackViewTurn = (): void => {
    cancelAnimationFrame(viewRaf.current)
    viewRaf.current = requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      // Maßgeblich ist das obere Drittel; ganz unten zählt alles Sichtbare (sonst wäre der letzte Turn nie dran).
      const atEnd = root.scrollHeight - root.scrollTop - root.clientHeight < 30
      const top = atEnd ? rect.bottom - 20 : rect.top + root.clientHeight / 3
      let current: string | undefined
      for (const u of root.querySelectorAll<HTMLElement>('.unit[data-user]')) {
        const first = u.firstElementChild as HTMLElement | null
        if (!first) continue
        if (first.getBoundingClientRect().top <= top || !current) current = u.dataset.itemId
        else break
      }
      if (current && useStore.getState().viewTurn[chatId] !== current) {
        useStore.setState((s) => ({ viewTurn: { ...s.viewTurn, [chatId]: current } }))
      }
    })
  }
  useEffect(() => {
    trackViewTurn()
    return () => cancelAnimationFrame(viewRaf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, chatId])

  function onScroll(): void {
    trackViewTurn()
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

  // Sprung an eine Stelle (z. B. Abzweigstelle eines Nebenchats), sobald sie gerendert ist.
  const jump = useStore((s) => (s.jump?.chatId === chatId ? s.jump : null))
  useEffect(() => {
    if (!jump || !transcript) return
    let frames = 0
    let raf = 0
    const tryJump = (): void => {
      const root = scrollRef.current
      const el =
        (jump.forkChild && root?.querySelector<HTMLElement>(`[data-fork-child="${CSS.escape(jump.forkChild)}"]`)) ||
        (jump.itemId && lastUnitElement(root, jump.itemId)) ||
        null
      if (!el) {
        if (++frames < 90) raf = requestAnimationFrame(tryJump)
        else useStore.getState().clearJump(jump.n)
        return
      }
      stickRef.current = false
      programmaticUntil.current = 0
      setAtBottom(false)
      // Zitierte Stelle suchen: sie wird gelb markiert und in die Mitte gescrollt (sonst die Markierung).
      const at = jump.forkChild ? useStore.getState().chats.find((c) => c.id === jump.forkChild)?.forkFrom?.at : undefined
      const roots = at?.itemId ? [...(root?.querySelectorAll(`.unit[data-item-id="${CSS.escape(at.itemId)}"]`) ?? [])] : []
      const range = at?.quote ? findQuoteRange(roots, at.quote) : null
      const target = (range?.startContainer.parentElement as HTMLElement | null) ?? el
      target.scrollIntoView({ block: 'center' })
      if (range) highlightRange(range)
      // Bei Nutzernachrichten nur die Blase aufleuchten lassen, nicht die ganze Zeile.
      const flash = el.querySelector<HTMLElement>('.bubble') ?? el
      flash.classList.remove('jump-flash')
      void flash.offsetWidth
      flash.classList.add('jump-flash')
      useStore.getState().clearJump(jump.n)
    }
    raf = requestAnimationFrame(tryJump)
    return () => cancelAnimationFrame(raf)
  }, [jump, transcript])

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

/** Sichtbares Element der letzten Darstellungseinheit eines Transkript-Eintrags. */
function lastUnitElement(root: HTMLElement | null, itemId: string): HTMLElement | null {
  const units = root?.querySelectorAll<HTMLElement>(`.unit[data-item-id="${CSS.escape(itemId)}"]`)
  const last = units?.[units.length - 1]
  return (last?.firstElementChild as HTMLElement | null) ?? null
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
    if (!autoFocus || !el) return
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

  const queue = useStore((s) => s.queues[chatId]) ?? EMPTY_QUEUE
  const steering = useStore((s) => s.steering[chatId]) ?? NO_STEERING
  // Zwischenrufe in eine laufende Antwort: Claude und Codex (app-server).
  const canSteer = busy

  async function submit(): Promise<void> {
    const t = text.trim()
    if (!canSend) return
    setError(null)
    setText('')
    const sent = attachments
    const st = useStore.getState()
    st.clearAttachments(chatId)
    const sentRefs = st.takeRefs(chatId)
    // Arbeitet der Chat (oder warten schon Nachrichten), wird eingereiht statt gesendet.
    if (shouldQueue(st.queues[chatId] ?? EMPTY_QUEUE, !!st.busy[chatId])) {
      st.enqueue(chatId, { text: t, refs: sentRefs, attachments: sent })
      return
    }
    try {
      await useStore.getState().send(chatId, composeMessage(sentRefs, t), sent)
    } catch (e) {
      setText(t)
      useStore.getState().restoreRefs(chatId, sentRefs)
      for (const a of sent) useStore.setState((st) => ({ pendingAttachments: { ...st.pendingAttachments, [chatId]: [...(st.pendingAttachments[chatId] ?? []), a] } }))
      setError(ipcError(e))
    }
  }

  /** Eingereihte Nachricht zurück ins Eingabefeld holen (vor einen evtl. schon getippten Text). */
  function editQueued(id: string): void {
    const st = useStore.getState()
    const m = st.takeQueued(chatId, id)
    if (!m) return
    const current = text.trim()
    setText(current ? `${m.text}\n\n${current}` : m.text)
    st.restoreRefs(chatId, m.refs)
    for (const a of m.attachments) useStore.setState((s) => ({ pendingAttachments: { ...s.pendingAttachments, [chatId]: [...(s.pendingAttachments[chatId] ?? []), a] } }))
    ref.current?.focus()
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
      {(queue.items.length > 0 || queue.paused || steering.length > 0) && (
        <QueueList chatId={chatId} queue={queue} steering={steering} busy={busy} canSteer={canSteer} onEdit={editQueued} />
      )}
      {refs.length > 0 && <RefChips chatId={chatId} refs={refs} />}
      {attachments.length > 0 && <AttachmentChips chatId={chatId} attachments={attachments} />}
      <div className="composer-row">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          placeholder={
            busy
              ? `${agentLabel} arbeitet – Enter reiht die Nachricht ein`
              : `Nachricht an ${agentLabel} … (Enter senden, Shift+Enter Zeilenumbruch)`
          }
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => void onPaste(e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {busy && canSend && (
          <button className="btn" onClick={() => void submit()} title="Einreihen – wird gesendet, wenn die Antwort fertig ist">
            <Icon name="queue" />
          </button>
        )}
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
