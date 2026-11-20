import { useState } from 'react'
import { displayDir } from '@shared/paths'
import { ipcError, useStore } from '../store'
import { Icon } from './Icon'

/**
 * Arbeitsverzeichnis umziehen. Zwei Wege: C2UI verschiebt den Ordner selbst, oder er liegt schon
 * woanders und nur der Pfad muss nachgezogen werden. In beiden Fällen wandert Claudes Projektordner
 * mit – sonst wären Verlauf und Gedächtnis weg.
 */
export function MoveDirDialog() {
  const cwd = useStore((s) => s.moveDir)
  const home = useStore((s) => s.home)
  const chats = useStore((s) => s.chats)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!cwd) return null

  const betroffen = chats.filter((c) => c.cwd.replace(/\/+$/, '') === cwd.replace(/\/+$/, '')).length
  const close = (): void => useStore.getState().setMoveDir(null)
  const los = async (move: boolean): Promise<void> => {
    setError('')
    const picked = await window.api.pickDirectory(cwd)
    if (!picked) return
    setBusy(true)
    try {
      await useStore.getState().moveWorkdir(cwd, picked, move)
      close()
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal move-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Arbeitsverzeichnis umziehen</h2>
        <div className="move-now">
          <Icon name="folder" size={14} />
          <span title={cwd}>{displayDir(cwd, home, 48)}</span>
        </div>
        <span className="muted small">
          {betroffen === 1 ? 'Ein Chat arbeitet hier' : `${betroffen} Chats arbeiten hier`} – sie ziehen alle mit. Claudes
          Verlauf und Gedächtnis dieses Ordners wandern ebenfalls, damit die Sitzungen weiterlaufen. Was am Ziel schon
          liegt, bleibt unangetastet.
        </span>
        {error && <p className="merge-error">{error}</p>}
        <div className="move-actions">
          <button className="btn primary" disabled={busy} onClick={() => void los(true)}>
            Ordner verschieben nach …
          </button>
          <span className="muted small">Wähle den Ordner, <em>in den</em> er kommen soll.</span>
          <button className="btn" disabled={busy} onClick={() => void los(false)}>
            Ordner liegt schon woanders …
          </button>
          <span className="muted small">Wähle den Ordner an seinem neuen Platz.</span>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
