import { useEffect, useState } from 'react'
import type { SessionInfo } from '../../../main/sessions'
import { displayDir } from '@shared/paths'
import { ipcError, useStore } from '../store'
import { AgentLogo } from './AgentLogo'

/**
 * Bestehende Claude-Session übernehmen: Verzeichnis wählen, Session aus der Liste nehmen.
 * Der Chat setzt sie dann fort (`claude --resume`); der bisherige Verlauf ist dem Agenten bekannt,
 * erscheint im Fenster aber nicht.
 */
export function AdoptDialog() {
  const open = useStore((s) => s.adoptOpen)
  const home = useStore((s) => s.home)
  const last = useStore((s) => s.settings?.lastDirectory ?? '')
  const [cwd, setCwd] = useState(last)
  const [list, setList] = useState<SessionInfo[] | null>(null)
  const [error, setError] = useState('')
  const close = (): void => useStore.getState().setAdoptOpen(false)

  useEffect(() => {
    if (!open) return
    setCwd(last)
    setError('')
  }, [open, last])

  useEffect(() => {
    if (!open || !cwd) return
    let current = true
    setList(null)
    setError('')
    window.api
      .sessions(cwd)
      .then((l) => current && setList(l))
      .catch((e) => current && (setList([]), setError(ipcError(e))))
    return () => {
      current = false
    }
  }, [open, cwd])

  if (!open) return null
  const pick = async (): Promise<void> => {
    const dir = await window.api.pickDirectory(cwd || undefined)
    if (dir) setCwd(dir)
  }
  const adopt = async (s: SessionInfo): Promise<void> => {
    try {
      await useStore.getState().adoptSession(cwd, s.sessionId, s.title)
      close()
    } catch (e) {
      setError(ipcError(e))
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal adopt-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Session übernehmen</h2>
        <span className="muted small">
          Ein Chat setzt eine bestehende Claude-Session dieses Ordners fort – auch eine aus Claude Code. Der Verlauf
          bleibt dem Agenten bekannt, erscheint hier aber nicht. Nicht gleichzeitig anderswo weiterführen.
        </span>
        <div className="adopt-dir">
          <span className="muted small">{cwd ? displayDir(cwd, home) : 'Kein Ordner gewählt'}</span>
          <button className="btn small-btn" onClick={() => void pick()}>
            Ordner wählen …
          </button>
        </div>
        {error && <p className="merge-error">{error}</p>}
        {list === null ? (
          <span className="muted small">Suche Sessions …</span>
        ) : list.length === 0 ? (
          <span className="muted small">Für diesen Ordner gibt es keine Claude-Sessions.</span>
        ) : (
          <ul className="adopt-list">
            {list.map((s) => (
              <li key={s.sessionId}>
                <button className="adopt-item" title={s.sessionId} onClick={() => void adopt(s)}>
                  <AgentLogo agent="claude" size={14} />
                  <span className="adopt-title">{s.title || s.sessionId.slice(0, 8)}</span>
                  <span className="muted small adopt-meta">
                    {when(s.updatedAt)} · {mb(s.bytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}

function when(ts: number): string {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const mb = (bytes: number): string => `${(bytes / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
