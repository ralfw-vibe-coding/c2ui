import { useEffect, useState } from 'react'
import { parseUpdateState, type UpdateState } from '@shared/update'
import { AGENT_KINDS, AGENTS, DEFAULT_MERGE, type AgentKind, type AgentSettings, type MergeSettings, type NotifySettings, type Settings } from '@shared/types'
import { useModelList } from '../models'
import { useStore } from '../store'
import { AgentLogo } from './AgentLogo'

export function SettingsDialog() {
  const settings = useStore((s) => s.settings)
  const [draft, setDraft] = useState<Settings | null>(settings)
  if (!draft) return null
  const close = (): void => useStore.getState().setSettingsOpen(false)
  const setAgent = (a: AgentKind, patch: Partial<AgentSettings>): void =>
    setDraft({ ...draft, agents: { ...draft.agents, [a]: { ...draft.agents[a], ...patch } } })

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Einstellungen</h2>
        {AGENT_KINDS.map((a) => (
          <fieldset key={a} className="agent-settings">
            <legend>
              <AgentLogo agent={a} size={16} /> {AGENTS[a].label}
            </legend>
            <label>
              <span>Standardmodus für neue Chats</span>
              <select value={draft.agents[a].defaultMode} onChange={(e) => setAgent(a, { defaultMode: e.target.value })}>
                {AGENTS[a].modes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label>
                <span>Modell</span>
                <ModelSelect agent={a} value={draft.agents[a].model} onChange={(model) => setAgent(a, { model })} />
              </label>
              <label>
                <span>Pfad zur Binary (leer = über PATH)</span>
                <input
                  value={draft.agents[a].path}
                  placeholder={a}
                  onChange={(e) => setAgent(a, { path: e.target.value.trim() })}
                />
              </label>
            </div>
          </fieldset>
        ))}
        <label>
          <span>Leerlauf, nach dem ein Claude-Prozess beendet wird (Minuten)</span>
          <input
            type="number"
            min={1}
            value={draft.idleTimeoutMinutes}
            onChange={(e) => setDraft({ ...draft, idleTimeoutMinutes: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.collapseSteps}
            onChange={(e) => setDraft({ ...draft, collapseSteps: e.target.checked })}
          />
          <span>Arbeitsschritte (Werkzeugaufrufe, Zwischentexte) im Chat einklappen</span>
        </label>
        <NotifySection value={draft.notifications} onChange={(notifications) => setDraft({ ...draft, notifications })} />
        <MergeSection value={draft.merge} onChange={(merge) => setDraft({ ...draft, merge })} />
        <ComponentsSection />
        <UpdateSection />
        <p className="muted small">Änderungen gelten für neu gestartete CLI-Prozesse.</p>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await useStore.getState().saveSettings(draft)
              close()
            }}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}

const CUSTOM = '__custom__'

/** Dropdown mit den bekannten Modellen der CLI, „Standard der CLI“ und freier Eingabe. */
function ModelSelect({ agent, value, onChange }: { agent: AgentKind; value: string; onChange: (v: string) => void }) {
  const list = useModelList(agent)
  const [custom, setCustom] = useState(false)

  const known = list?.options ?? []
  const isKnown = value === '' || known.some((o) => o.value === value)
  const showCustom = custom || (!!list && !isKnown)

  return (
    <div className="model-select">
      <select
        value={showCustom ? CUSTOM : value}
        disabled={!list}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true)
          } else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
      >
        <option value="">
          {list ? `Standard der CLI${list.cliDefault ? ` (${list.cliDefault})` : ''}` : 'Lade Modelle …'}
        </option>
        {known.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label.toLowerCase() === o.value.toLowerCase() ? o.label : `${o.label} (${o.value})`}
          </option>
        ))}
        <option value={CUSTOM}>Anderes Modell …</option>
      </select>
      {showCustom && (
        <input
          autoFocus={custom}
          value={value}
          placeholder="Modellname oder -ID"
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}
      {list?.error && <span className="muted small">{list.error}</span>}
    </div>
  )
}

/** Hinweise über Chats im Hintergrund. */
function NotifySection({ value, onChange }: { value: NotifySettings; onChange: (n: NotifySettings) => void }) {
  return (
    <fieldset className="agent-settings">
      <legend>Benachrichtigungen</legend>
      <label className="check-row">
        <input type="checkbox" checked={value.done} onChange={(e) => onChange({ ...value, done: e.target.checked })} />
        <span>Wenn ein Chat fertig ist</span>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={value.stalled} onChange={(e) => onChange({ ...value, stalled: e.target.checked })} />
        <span>Wenn ein Chat hängt, also während eines Turns nichts mehr kommt</span>
      </label>
      <label className="notify-minutes">
        <span>Nach wie vielen Minuten Stille gilt ein Chat als hängend</span>
        <input
          type="number"
          min={1}
          disabled={!value.stalled}
          value={value.stalledMinutes}
          onChange={(e) => onChange({ ...value, stalledMinutes: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
        />
      </label>
      <span className="muted small">
        Gemeldet wird nur, was du nicht ohnehin siehst: Das Fenster ist im Hintergrund oder der Chat ist in keiner
        Zelle offen. Ein Klick auf die Meldung holt ihn nach vorn.
      </span>
    </fieldset>
  )
}

/** Standard-Prompts fürs Zusammenführen (Nebenchat B → Chat A). */
function MergeSection({ value, onChange }: { value: MergeSettings; onChange: (m: MergeSettings) => void }) {
  const field = (key: 'prepare' | 'adopt', label: string, rows: number) => (
    <label>
      <span className="merge-setting-head">
        {label}
        {value[key] !== DEFAULT_MERGE[key] && (
          <button className="link-btn" onClick={() => onChange({ ...value, [key]: DEFAULT_MERGE[key] })}>
            Zurücksetzen
          </button>
        )}
      </span>
      <textarea rows={rows} value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
    </label>
  )
  return (
    <fieldset className="agent-settings">
      <legend>Zusammenführen</legend>
      {field('prepare', 'Aufarbeitung im Nebenchat (B)', 4)}
      {field('adopt', 'Übernahme im Zielchat (A)', 2)}
      <label className="check-row">
        <input type="checkbox" checked={value.preview} onChange={(e) => onChange({ ...value, preview: e.target.checked })} />
        <span>Aufarbeitung vor der Übernahme zeigen (Voreinstellung im Dialog)</span>
      </label>
      <span className="muted small">
        Platzhalter: {'{Titel}'} = Nebenchat, {'{Ziel}'} = Zielchat. Gilt, wenn das Feld im Dialog leer bleibt.
      </span>
    </fieldset>
  )
}

/** Eigene A2UI-Komponenten: Liste, Werkstatt, Ordner, Fehler. */
function ComponentsSection() {
  const { defs, errors, dir } = useStore((s) => s.components)
  const open = (name?: string): void => void useStore.getState().openWorkshop(name)
  return (
    <fieldset className="agent-settings">
      <legend>Eigene A2UI-Komponenten</legend>
      {defs.length > 0 && (
        <ul className="components-list">
          {defs.map((d) => (
            <li key={d.name}>
              <span className="components-name">{d.name}</span>
              <span className="muted small components-desc">{d.description}</span>
              <button className="btn small-btn" onClick={() => open(d.name)} title="In der Komponenten-Werkstatt mit Claude bearbeiten">
                Mit Claude bearbeiten
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="components-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="components-head">
        <button className="btn primary" onClick={() => open()}>
          Neue Komponente mit Claude
        </button>
        <button className="btn" onClick={() => window.api.reveal(dir)}>
          Ordner öffnen
        </button>
      </div>
      <span className="muted small">
        Die Werkstatt öffnet einen Claude-Chat im Komponenten-Ordner (neben dem aktuellen). Änderungen wirken sofort – auch
        auf bereits angezeigte Screens.
      </span>
    </fieldset>
  )
}

interface Build {
  version?: string
  build?: number
  commit?: string
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/** Aktualisierung aus einem Ordner (z. B. geteilter Dropbox-Ordner). Nur in der gebauten App. */
function UpdateSection() {
  const update = useStore((s) => s.update)
  const [build, setBuild] = useState<Build | null>(null)
  const [working, setWorking] = useState(false)
  useEffect(() => {
    void window.api.updateCurrent().then((b) => setBuild(b && typeof b === 'object' ? (b as Build) : null))
  }, [])
  if (update.state === 'unavailable') return null

  const apply = (u: unknown): void => useStore.setState({ update: parseUpdateState(u) })
  const run = async (f: () => Promise<unknown>): Promise<void> => {
    setWorking(true)
    try {
      apply(await f())
    } finally {
      setWorking(false)
    }
  }
  const pick = async (): Promise<void> => {
    const dir = await window.api.pickDirectory('folder' in update ? update.folder : undefined)
    if (dir) await run(() => window.api.updateFolder(dir))
  }
  const install = async (): Promise<void> => {
    const busy = Object.values(useStore.getState().busy).filter(Boolean).length
    if (busy && !(await window.api.confirm(`${busy} Chat(s) arbeiten noch.`, 'Beim Aktualisieren wird C2UI beendet und neu gestartet; laufende Antworten werden abgebrochen.', 'Aktualisieren'))) return
    await run(() => window.api.updateInstall())
  }

  return (
    <fieldset className="agent-settings">
      <legend>Aktualisierung</legend>
      {build?.build && (
        <span className="muted small">
          Installiert: Version {build.version}, Build {build.build}
          {build.commit ? ` (${build.commit})` : ''}
        </span>
      )}
      {'folder' in update && <span className="small update-folder" title={update.folder}>Update-Ordner: {update.folder}</span>}
      <UpdateStatus update={update} onInstall={() => void install()} />
      <div className="components-head">
        <button className="btn" disabled={working || update.state === 'installing'} onClick={() => void pick()}>
          Ordner wählen …
        </button>
        <button className="btn" disabled={working || update.state === 'off' || update.state === 'installing'} onClick={() => void run(() => window.api.updateCheck())}>
          Jetzt prüfen
        </button>
        <button className="btn" disabled={working || update.state === 'off' || update.state === 'installing'} onClick={() => void run(() => window.api.updateFolder(undefined))}>
          Update-Ordner entfernen
        </button>
      </div>
      <span className="muted small">
        C2UI schaut beim Start und alle 30 Minuten in diesen Ordner (z. B. einen geteilten Dropbox-Ordner) und bietet neuere
        Builds an. Der Ordner gilt nur für diesen Mac.
      </span>
    </fieldset>
  )
}

function UpdateStatus({ update, onInstall }: { update: UpdateState; onInstall: () => void }) {
  switch (update.state) {
    case 'off':
      return <span className="update-status">Kein Update-Ordner gewählt.</span>
    case 'current':
      return <span className="update-status">Aktuell · zuletzt geprüft {timeOf(update.checked)}</span>
    case 'available':
      return (
        <span className="update-status available">
          Build {update.offer.build} ist da ·{' '}
          <button className="btn primary small-btn" onClick={onInstall} title={update.offer.file}>
            Jetzt aktualisieren
          </button>
        </span>
      )
    case 'installing':
      return <span className="update-status">Build {update.offer.build} wird installiert – C2UI startet gleich neu …</span>
    case 'failed':
      return <span className="update-status failed">{update.message}</span>
    default:
      return null
  }
}
