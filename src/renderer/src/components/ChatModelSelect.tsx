import { chatModel, type Chat } from '@shared/types'
import { modelDisplay, useModelList } from '../models'
import { useStore } from '../store'

/**
 * Modell eines Chats im Zellenkopf: sieht aus wie Text, ist aber ein Dropdown.
 * Ein Wechsel gilt ab dem nächsten Turn; der Verlauf bleibt erhalten.
 */
export function ChatModelSelect({ chat }: { chat: Chat }) {
  const settings = useStore((s) => s.settings)
  const list = useModelList(chat.agent)
  if (!settings) return null
  const value = chatModel(chat, settings)
  const known = list?.options ?? []
  const custom = value && !known.some((o) => o.value === value)

  return (
    <label className="model-chip" title="Modell dieses Chats (Wechsel gilt ab der nächsten Nachricht)">
      <span className="model-chip-text">{modelDisplay(value, list)}</span>
      <select
        value={value}
        onChange={(e) => window.api.updateChat(chat.id, { model: e.target.value })}
        aria-label="Modell"
      >
        <option value="">{modelDisplay('', list)}</option>
        {known.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {custom && <option value={value}>{value}</option>}
      </select>
    </label>
  )
}
