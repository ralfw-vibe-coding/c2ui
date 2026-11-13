import { useState, useSyncExternalStore } from 'react'
import { chatTree, visibleRows } from '@shared/chatTree'
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
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed)
  const tree = chatTree(chats)
  const rows = visibleRows(tree, collapsed)
  // Platz für die Auf-/Zu-Pfeile nur, wenn es überhaupt Nebenchats gibt.
  const hasTree = tree.some((n) => n.children.length > 0)

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
        {rows.map(({ node, depth }) => (
          <ChatItem
            key={node.chat.id}
            chat={node.chat}
            depth={depth}
            childCount={node.children.length ? node.descendants : 0}
            showToggle={hasTree}
            collapsed={collapsed.has(node.chat.id)}
            open={open.has(node.chat.id)}
            inSelected={open.get(node.chat.id) === selectedCellId}
            busy={!!busy[node.chat.id]}
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

// Zugeklappte Teilbäume (pro Rechner, im localStorage).
const COLLAPSED_KEY = 'c2ui.collapsedChats'
let collapsedSet: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set<string>()
  }
})()
const collapsedListeners = new Set<() => void>()
function subscribeCollapsed(l: () => void): () => void {
  collapsedListeners.add(l)
  return () => collapsedListeners.delete(l)
}
const getCollapsed = (): Set<string> => collapsedSet
function toggleCollapsed(id: string): void {
  collapsedSet = new Set(collapsedSet)
  if (collapsedSet.has(id)) collapsedSet.delete(id)
  else collapsedSet.add(id)
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedSet]))
  } catch {
    /* egal */
  }
  collapsedListeners.forEach((l) => l())
}

const INDENT = 14

function ChatItem({
  chat,
  depth,
  childCount,
  collapsed,
  showToggle,
  open,
  inSelected,
  busy
}: {
  chat: Chat
  depth: number
  /** Anzahl aller Nebenchats darunter (0 = keine). */
  childCount: number
  collapsed: boolean
  showToggle: boolean
  open: boolean
  inSelected: boolean
  busy: boolean
}) {
  const home = useStore((s) => s.home)
  const [editing, setEditing] = useState(false)
  const fork = chat.forkFrom
  const forkInfo = fork
    ? `\nAbgezweigt aus „${fork.title}“${fork.at ? ` nach ${fork.at.turn} ${fork.at.turn === 1 ? 'Turn' : 'Turns'}` : ''}${fork.at?.quote ? `:\n„${fork.at.quote.slice(0, 120)}${fork.at.quote.length > 120 ? '…' : ''}“` : ''}`
    : ''

  return (
    <li
      className={`chat-item${open ? ' open' : ''}${inSelected ? ' in-selected' : ''}${depth ? ' nested' : ''}`}
      style={depth ? { paddingLeft: 6 + depth * INDENT, ['--depth-x' as string]: `${depth * INDENT - 1}px` } : undefined}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData(CHAT_MIME, chat.id)
        e.dataTransfer.effectAllowed = 'move'
        useStore.getState().setDragging(chat.id)
      }}
      onDragEnd={() => useStore.getState().setDragging(null)}
      onClick={() => !editing && useStore.getState().openChat(chat.id)}
      title={`${chat.title}\n${chat.cwd}${forkInfo}\nDoppelklick: umbenennen · Ziehen: in Zelle legen`}
    >
      {childCount > 0 ? (
        <button
          className="tree-toggle"
          title={collapsed ? `${childCount} Nebenchat${childCount === 1 ? '' : 's'} zeigen` : 'Nebenchats einklappen'}
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapsed(chat.id)
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      ) : (
        showToggle && <span className="tree-toggle placeholder" />
      )}
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
      {collapsed && childCount > 0 && (
        <span className="tree-count" title={`${childCount} Nebenchat${childCount === 1 ? '' : 's'} eingeklappt`}>
          +{childCount}
        </span>
      )}
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
