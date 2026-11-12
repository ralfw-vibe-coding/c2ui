import { useState } from 'react'
import * as L from '@shared/layout'
import { AGENT_KINDS, AGENTS, type Chat } from '@shared/types'
import { baseName, CHAT_MIME, shortPath, useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { ConfirmButton } from './ConfirmButton'
import { EditableTitle } from './EditableTitle'
import { formatDate } from './EmptyCell'
import { Icon } from './Icon'

export function Sidebar() {
  const updateReady = useStore((s) => s.update.state === 'available')
  const chats = useStore((s) => s.chats)
  const root = useStore((s) => s.layout.root)
  const selectedCellId = useStore((s) => s.layout.selectedCellId)
  const busy = useStore((s) => s.busy)
  const open = new Map(L.leaves(root).filter((l) => l.chatId).map((l) => [l.chatId!, l.id]))

  return (
    <aside className="sidebar">
      <div className="titlebar drag-region" />
      <div className="sidebar-actions">
        {AGENT_KINDS.map((a) => (
          <button
            key={a}
            className="btn new-agent"
            title={`Neuer ${AGENTS[a].label}-Chat in der markierten Zelle`}
            onClick={() => useStore.getState().newChat(a)}
          >
            <Icon name="plus" size={14} />
            <AgentLogo agent={a} size={16} />
            <span>{AGENTS[a].label}</span>
          </button>
        ))}
      </div>
      <ul className="chat-list">
        {chats.map((c) => (
          <ChatItem
            key={c.id}
            chat={c}
            open={open.has(c.id)}
            inSelected={open.get(c.id) === selectedCellId}
            busy={!!busy[c.id]}
          />
        ))}
        {chats.length === 0 && <li className="muted small pad">Noch keine Chats.</li>}
      </ul>
      <div className="sidebar-bottom">
        <button className="icon-btn" title="Einstellungen" onClick={() => useStore.getState().setSettingsOpen(true)}>
          <Icon name="gear" /> <span>Einstellungen</span>
          {updateReady && <span className="update-dot" title="Neue Version verfügbar" />}
        </button>
      </div>
    </aside>
  )
}

function ChatItem({ chat, open, inSelected, busy }: { chat: Chat; open: boolean; inSelected: boolean; busy: boolean }) {
  const home = useStore((s) => s.home)
  const [editing, setEditing] = useState(false)

  return (
    <li
      className={`chat-item${open ? ' open' : ''}${inSelected ? ' in-selected' : ''}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData(CHAT_MIME, chat.id)
        e.dataTransfer.effectAllowed = 'move'
        useStore.getState().setDragging(chat.id)
      }}
      onDragEnd={() => useStore.getState().setDragging(null)}
      onClick={() => !editing && useStore.getState().openChat(chat.id)}
      title={`${chat.title}\n${chat.cwd}\nDoppelklick: umbenennen · Ziehen: in Zelle legen`}
    >
      <span className="chat-status">
        {busy ? <span className="spinner" /> : <AgentLogo agent={chat.agent} size={14} />}
        {open && !busy && <span className="dot" />}
      </span>
      <div className="chat-text">
        <EditableTitle
          chatId={chat.id}
          title={chat.title}
          className="chat-title"
          editing={editing}
          onEditingChange={setEditing}
        />
        <span className="chat-meta">
          <Icon name="folder" size={12} /> {baseName(shortPath(chat.cwd, home))} · {formatDate(chat.updatedAt)}
        </span>
      </div>
      {!editing && (
        <button
          className="icon-btn hover-only"
          title="Umbenennen"
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          <Icon name="pencil" size={14} />
        </button>
      )}
      <ConfirmButton
        icon="trash"
        className="danger hover-only"
        title="Chat löschen"
        confirmTitle="Wirklich löschen? Nochmal klicken"
        onConfirm={() => void useStore.getState().deleteChat(chat.id)}
      />
    </li>
  )
}

export function SidebarToggle() {
  const collapsed = useStore((s) => s.sidebarCollapsed)
  return (
    <button
      className="icon-btn no-drag sidebar-toggle"
      title={collapsed ? 'Seitenleiste einblenden (⌘B)' : 'Seitenleiste ausblenden (⌘B)'}
      onClick={() => useStore.getState().toggleSidebar()}
    >
      <Icon name="sidebar" size={18} />
    </button>
  )
}
