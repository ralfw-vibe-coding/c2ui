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

  const [width, setWidth] = useState(readWidth)

  /** Breite per Ziehen am rechten Rand; Doppelklick setzt sie zurück. */
  const startResize = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-col')
    let w = startW
    const move = (ev: PointerEvent): void => {
      w = clampWidth(startW + ev.clientX - startX)
      setWidth(w)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing-col')
      writeWidth(w)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return (
    <aside className="sidebar" style={{ width }}>
      <div
        className="sidebar-resizer"
        title="Breite ziehen · Doppelklick: Standardbreite"
        onPointerDown={startResize}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH)
          writeWidth(DEFAULT_WIDTH)
        }}
      />
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
        <button
          className="icon-btn adopt-btn"
          title="Bestehende Claude-Session übernehmen (z. B. aus Claude Code)"
          onClick={() => useStore.getState().setAdoptOpen(true)}
        >
          <Icon name="history" size={15} /> <span>Session</span>
        </button>
        <button className="icon-btn" title="Einstellungen" onClick={() => useStore.getState().setSettingsOpen(true)}>
          <Icon name="gear" /> <span>Einstellungen</span>
          {updateReady && <span className="update-dot" title="Neue Version verfügbar" />}
        </button>
      </div>
    </aside>
  )
}

// Breite der Seitenleiste (pro Rechner, im localStorage).
const WIDTH_KEY = 'c2ui.sidebarWidth'
const DEFAULT_WIDTH = 260
const clampWidth = (w: number): number => Math.round(Math.min(560, Math.max(180, w)))
function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    return v ? clampWidth(v) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}
function writeWidth(w: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    /* egal */
  }
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
        useStore.getState().setDragging({ chatId: chat.id })
      }}
      onDragEnd={() => useStore.getState().setDragging(null)}
      onClick={(e) => {
        if (editing) return
        const st = useStore.getState()
        void (e.metaKey ? st.openInNewCell(chat.id) : st.openChat(chat.id))
      }}
      title={`${chat.title}\n${chat.cwd}${forkInfo}\nKlick: öffnen · ⌘-Klick: in neuer Zelle · Ziehen: in Zelle legen · Doppelklick: umbenennen`}
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
        <div className="chat-title-row">
          <EditableTitle
            chatId={chat.id}
            title={chat.title}
            className="chat-title"
            editing={editing}
            onEditingChange={setEditing}
          />
          {!editing && collapsed && childCount > 0 && (
            <span className="tree-count" title={`${childCount} Nebenchat${childCount === 1 ? '' : 's'} eingeklappt`}>
              +{childCount}
            </span>
          )}
        </div>
        <span className="chat-meta">
          <Icon name="folder" size={12} /> {baseName(shortPath(chat.cwd, home))} · {formatDate(chat.updatedAt)}
        </span>
      </div>
      {!editing && (depth > 0 || childCount > 0) && (
        <button
          className="icon-btn hover-only"
          title="Diskursboard dieses Baums öffnen"
          onClick={(e) => {
            e.stopPropagation()
            useStore.getState().openBoard(chat.id)
          }}
        >
          <Icon name="board" size={14} />
        </button>
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
