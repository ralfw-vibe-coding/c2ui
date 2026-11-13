import { useState } from 'react'
import type { DropZone } from '@shared/layout'
import { AGENTS } from '@shared/types'
import { displayDir } from '@shared/paths'
import { BOARD_MIME, CHAT_MIME, useChat, useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { ChatModelSelect } from './ChatModelSelect'
import { Board } from './Board'
import { ChatPanel } from './ChatPanel'
import { EditableTitle } from './EditableTitle'
import { EmptyCell } from './EmptyCell'
import { Icon } from './Icon'

export function Cell({ cellId, chatId, board }: { cellId: string; chatId: string | null; board?: string }) {
  const selected = useStore((s) => s.layout.selectedCellId === cellId)
  const dragging = useStore((s) => s.dragging)
  const chat = useChat(chatId)
  const busy = useStore((s) => (chatId ? !!s.busy[chatId] : false))
  const home = useStore((s) => s.home)
  const [editing, setEditing] = useState(false)
  const boardTitle = useStore((s) => (board ? s.chats.find((c) => c.id === board)?.title : undefined))
  const { selectCell, splitCell, closeChat, closeBoard, removeCell, setDragging } = useStore.getState()

  return (
    <div
      className={`cell${selected ? ' selected' : ''}`}
      onMouseDownCapture={() => selectCell(cellId)}
      data-cell-id={cellId}
    >
      <div className="cell-header">
        {chat ? (
          <div
            className="cell-title"
            draggable={!editing}
            onDragStart={(e) => {
              e.dataTransfer.setData(CHAT_MIME, chat.id)
              e.dataTransfer.effectAllowed = 'move'
              setDragging({ chatId: chat.id })
            }}
            onDragEnd={() => setDragging(null)}
            title="Ziehen: in andere Zelle verschieben · Doppelklick auf den Titel: umbenennen"
          >
            {busy ? <span className="spinner" /> : <AgentLogo agent={chat.agent} />}
            <EditableTitle
              chatId={chat.id}
              title={chat.title}
              className="cell-title-text"
              editing={editing}
              onEditingChange={setEditing}
            />
            {!editing && (
              <button className="icon-btn rename-btn" title="Umbenennen" onClick={() => setEditing(true)}>
                <Icon name="pencil" size={13} />
              </button>
            )}
          </div>
        ) : board ? (
          <div
            className="cell-title"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(BOARD_MIME, board)
              e.dataTransfer.effectAllowed = 'move'
              setDragging({ board })
            }}
            onDragEnd={() => setDragging(null)}
            title="Diskursboard: alle Chats dieses Baums · Ziehen: in andere Zelle verschieben"
          >
            <Icon name="board" />
            <span className="cell-title-text">Diskurs: {boardTitle ?? '–'}</span>
          </div>
        ) : null}
        {chat && (
          <span className="cell-meta cell-cwd" title={chat.cwd}>
            <Icon name="folder" size={13} />
            {displayDir(chat.cwd, home)}
          </span>
        )}
        {chat && <ChatModelSelect chat={chat} />}
        <div className="cell-spacer" />
        <div className="cell-actions">
          {chat && (
            <select
              className="mode-select"
              value={chat.permissionMode}
              title={chat.agent === 'codex' ? 'Sandbox-Modus (gilt ab dem nächsten Turn)' : 'Berechtigungsmodus (gilt ab dem nächsten Prozessstart)'}
              onChange={(e) =>
                window.api.updateChat(chat.id, { permissionMode: e.target.value })
              }
            >
              {AGENTS[chat.agent].modes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <button className="icon-btn" title="Rechts teilen" onClick={() => splitCell(cellId, 'row')}>
            <Icon name="split-right" />
          </button>
          <button className="icon-btn" title="Unten teilen" onClick={() => splitCell(cellId, 'column')}>
            <Icon name="split-down" />
          </button>
          {chat && (
            <button className="icon-btn" title="Chat schließen (Zelle bleibt)" onClick={() => closeChat(cellId)}>
              <Icon name="close" />
            </button>
          )}
          {board && (
            <button className="icon-btn" title="Board schließen (Zelle bleibt)" onClick={() => closeBoard(cellId)}>
              <Icon name="close" />
            </button>
          )}
          <button className="icon-btn danger" title="Zelle entfernen" onClick={() => removeCell(cellId)}>
            <Icon name="trash" />
          </button>
        </div>
      </div>
      <div className="cell-body">
        {chatId ? (
          <ChatPanel chatId={chatId} active={selected} />
        ) : board ? (
          <Board rootId={board} cellId={cellId} />
        ) : (
          <EmptyCell cellId={cellId} />
        )}
      </div>
      {/* Knoten aus dem eigenen Board: dort wird zusammengeführt (Spur als Ziel), nicht in Zellen gelegt. */}
      {dragging && dragging.fromCell !== cellId && <DropOverlay cellId={cellId} />}
    </div>
  )
}

function zoneFor(e: React.DragEvent, el: HTMLElement): DropZone {
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const edge = 0.25
  const dists: [DropZone, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y]
  ]
  const [zone, d] = dists.reduce((a, b) => (b[1] < a[1] ? b : a))
  return d < edge ? zone : 'center'
}

function DropOverlay({ cellId }: { cellId: string }) {
  const [zone, setZone] = useState<DropZone | null>(null)
  const accepts = (e: React.DragEvent): boolean => e.dataTransfer.types.includes(CHAT_MIME) || e.dataTransfer.types.includes(BOARD_MIME)
  return (
    <div
      className="drop-overlay"
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const z = zoneFor(e, e.currentTarget)
        if (z !== zone) setZone(z)
      }}
      onDragLeave={() => setZone(null)}
      onDrop={(e) => {
        e.preventDefault()
        const st = useStore.getState()
        const what = st.dragging
        const z = zoneFor(e, e.currentTarget)
        setZone(null)
        st.setDragging(null)
        if (what) void st.drop(what, cellId, z)
      }}
    >
      {zone && <div className={`drop-zone drop-${zone}`} />}
    </div>
  )
}
