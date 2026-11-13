import { useEffect, useState } from 'react'
import { messageLabel } from '@shared/board'
import { fillPrompt, isLastTurn } from '@shared/merge'
import { DEFAULT_MERGE } from '@shared/types'
import { useStore, type MergeDialogState, type MergeRequest } from '../store'
import { AgentLogo } from './AgentLogo'

/**
 * Zusammenführen eines Nebenchats B in einen Chat A.
 * Einrichten: zwei Prompts (leer = Standard aus den Einstellungen) · Prüfen: Aufarbeitung vor der Übernahme bearbeiten.
 */
export function MergeDialog() {
  const d = useStore((s) => s.mergeDialog)
  if (!d) return null
  return (
    <div className="modal-backdrop" onMouseDown={() => useStore.getState().closeMerge()}>
      <div
        className="modal merge-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && useStore.getState().closeMerge()}
      >
        <MergeHead req={d} />
        {d.stage === 'setup' && <Setup req={d} />}
        {d.stage === 'review' && <Review d={d} />}
        {d.stage === 'error' && <Failed d={d} />}
      </div>
    </div>
  )
}

function MergeHead({ req }: { req: MergeRequest }) {
  const src = useStore((s) => s.chats.find((c) => c.id === req.sourceId))
  const dst = useStore((s) => s.chats.find((c) => c.id === req.targetId))
  const t = useStore((s) => s.transcripts[req.sourceId])
  const upTo = req.sourceItemId && t && !isLastTurn(t, req.sourceItemId) ? t.find((i) => i.id === req.sourceItemId) : undefined
  return (
    <>
      <h2>Zusammenführen</h2>
      <div className="merge-route">
        <span className="merge-chat">
          {src && <AgentLogo agent={src.agent} size={14} />} {src?.title ?? '–'}
        </span>
        <span className="merge-arrow">→</span>
        <span className="merge-chat">
          {dst && <AgentLogo agent={dst.agent} size={14} />} {dst?.title ?? '–'}
        </span>
      </div>
      {upTo?.type === 'user' && <span className="muted small">Bis einschließlich „{messageLabel(upTo.text, 70)}“</span>}
    </>
  )
}

function Setup({ req }: { req: MergeRequest }) {
  const defaults = useStore((s) => s.settings?.merge ?? DEFAULT_MERGE)
  const src = useStore((s) => s.chats.find((c) => c.id === req.sourceId))
  const dst = useStore((s) => s.chats.find((c) => c.id === req.targetId))
  const [prepare, setPrepare] = useState('')
  const [adopt, setAdopt] = useState('')
  const [preview, setPreview] = useState(defaults.preview)
  const [direct, setDirect] = useState(false)
  useEffect(() => void useStore.getState().ensureTranscripts([req.sourceId]), [req.sourceId])
  const vars = { source: src?.title ?? 'B', target: dst?.title ?? 'A' }
  const start = (): void => void useStore.getState().startMerge(req, { prepare, adopt, preview, direct })
  const submitOnCmdEnter = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      start()
    }
  }
  return (
    <>
      <label>
        <span>Aufarbeitung in „{vars.source}“ (leer = Standard)</span>
        <textarea
          rows={4}
          autoFocus
          disabled={direct}
          value={prepare}
          placeholder={fillPrompt(defaults.prepare, vars)}
          onChange={(e) => setPrepare(e.target.value)}
          onKeyDown={submitOnCmdEnter}
        />
      </label>
      <label>
        <span>Übernahme in „{vars.target}“ (leer = Standard)</span>
        <textarea
          rows={2}
          value={adopt}
          placeholder={fillPrompt(defaults.adopt, vars)}
          onChange={(e) => setAdopt(e.target.value)}
          onKeyDown={submitOnCmdEnter}
        />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
        <span>Ohne Aufarbeitung: Verlauf von „{vars.source}“ direkt übernehmen</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
        <span>{direct ? 'Verlauf' : 'Aufarbeitung'} vor der Übernahme zeigen und bearbeiten</span>
      </label>
      <span className="muted small">Die Standard-Prompts lassen sich in den Einstellungen ändern. ⌘↩ startet.</span>
      <div className="modal-actions">
        <button className="btn" onClick={() => useStore.getState().closeMerge()}>
          Abbrechen
        </button>
        <button className="btn primary merge-start" onClick={start}>
          Zusammenführen
        </button>
      </div>
    </>
  )
}

function Review({ d }: { d: Extract<MergeDialogState, { stage: 'review' }> }) {
  const dst = useStore((s) => s.chats.find((c) => c.id === d.targetId))
  const [text, setText] = useState(d.text)
  const [adopt, setAdopt] = useState(d.adopt)
  const go = (): void => void useStore.getState().adoptMerge(d, adopt, text, d.fromItemId)
  return (
    <>
      <label>
        <span>Übernahme-Prompt</span>
        <input value={adopt} onChange={(e) => setAdopt(e.target.value)} />
      </label>
      <label>
        <span>Wird übernommen (bearbeitbar)</span>
        <textarea
          className="merge-text"
          rows={14}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.metaKey && (e.preventDefault(), go())}
        />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={() => useStore.getState().closeMerge()}>
          Verwerfen
        </button>
        <button className="btn primary merge-adopt" disabled={!text.trim()} onClick={go}>
          In „{dst?.title ?? 'A'}“ übernehmen
        </button>
      </div>
    </>
  )
}

function Failed({ d }: { d: Extract<MergeDialogState, { stage: 'error' }> }) {
  return (
    <>
      <p className="merge-error">{d.error}</p>
      <div className="modal-actions">
        <button className="btn" onClick={() => useStore.getState().closeMerge()}>
          Schließen
        </button>
        <button className="btn primary" onClick={() => useStore.getState().openMerge({ sourceId: d.sourceId, sourceItemId: d.sourceItemId, targetId: d.targetId })}>
          Neu einrichten
        </button>
      </div>
    </>
  )
}
