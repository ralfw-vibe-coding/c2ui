import { displayDir } from '@shared/paths'
import { AGENTS } from '@shared/types'
import { baseName, useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { Icon } from './Icon'

/**
 * Arbeitsverzeichnis für einen neuen Chat. Zuerst die zuletzt dafür benutzten Ordner
 * (neuester oben) – oft will man wieder einen Chat auf demselben Projekt. Darunter führt
 * „Anderer Ordner …“ in den normalen Ordnerdialog.
 */
export function DirectoryDialog() {
  const pick = useStore((s) => s.dirPick)
  const dirs = useStore((s) => s.settings?.recentDirectories ?? [])
  const home = useStore((s) => s.home)
  if (!pick) return null

  const close = (): void => useStore.getState().cancelNewChat()
  const start = (dir: string): void => void useStore.getState().startChatIn(dir)
  const other = async (): Promise<void> => {
    const dir = await window.api.pickDirectory(dirs[0] || undefined)
    // Abgebrochen: der Dialog bleibt stehen, die Liste ist ja noch da.
    if (dir) start(dir)
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal dir-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>
          <AgentLogo agent={pick.agent} size={16} /> Neuer {AGENTS[pick.agent].label}-Chat
        </h2>
        <span className="muted small">In welchem Verzeichnis soll er arbeiten?</span>
        <ul className="dir-list">
          {dirs.map((d, i) => (
            <li key={d}>
              <button className="dir-item" autoFocus={i === 0} title={d} onClick={() => start(d)}>
                <Icon name="folder" size={14} />
                <span className="dir-name">{baseName(d)}</span>
                <span className="muted small dir-path">{parentDir(d, home)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => void other()}>
            Anderer Ordner …
          </button>
        </div>
      </div>
    </div>
  )
}

/** Der Pfad über dem Ordner – der Ordnername selbst steht schon davor. */
function parentDir(p: string, home: string): string {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  return i > 0 ? displayDir(p.slice(0, i), home, 34).replace(/\/$/, '') : '/'
}
