import { useState } from 'react'
import { AGENT_KINDS, AGENTS, type AgentKind, type AgentSettings, type Settings } from '@shared/types'
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
