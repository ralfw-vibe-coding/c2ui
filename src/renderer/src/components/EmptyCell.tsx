import { useMemo, useState } from 'react'
import * as L from '@shared/layout'
import { AGENT_KINDS, AGENTS } from '@shared/types'
import { baseName, shortPath, useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { Icon } from './Icon'

export function EmptyCell({ cellId }: { cellId: string }) {
  const chats = useStore((s) => s.chats)
  const root = useStore((s) => s.layout.root)
  const home = useStore((s) => s.home)
  const [filter, setFilter] = useState('')

  const closed = useMemo(() => {
    const open = new Set(L.leaves(root).map((l) => l.chatId).filter(Boolean))
    const f = filter.toLowerCase()
    return chats
      .filter((c) => !open.has(c.id))
      .filter((c) => !f || c.title.toLowerCase().includes(f) || c.cwd.toLowerCase().includes(f))
      .slice(0, 30)
  }, [chats, root, filter])

  return (
    <div className="empty-cell">
      <div className="new-chat-row">
        {AGENT_KINDS.map((a) => (
          <button key={a} className="new-chat-big" onClick={() => useStore.getState().newChat(a, cellId)}>
            <span className="new-chat-logo">
              <AgentLogo agent={a} size={30} />
              <span className="new-chat-plus">
                <Icon name="plus" size={12} />
              </span>
            </span>
            <span>{AGENTS[a].label}</span>
            <small>Neuer Chat</small>
          </button>
        ))}
      </div>
      <small className="muted">Danach wählst du das Arbeitsverzeichnis.</small>
      {chats.length > 0 && (
        <div className="previous">
          <input
            className="filter"
            placeholder="Frühere Chats durchsuchen …"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul>
            {closed.map((c) => (
              <li key={c.id}>
                <button onClick={() => useStore.getState().openChat(c.id, cellId)}>
                  <span className="prev-title">
                    <AgentLogo agent={c.agent} size={13} /> {c.title}
                  </span>
                  <span className="prev-meta" title={c.cwd}>
                    {baseName(shortPath(c.cwd, home))} · {formatDate(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
            {closed.length === 0 && <li className="muted small">Keine weiteren Chats.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
