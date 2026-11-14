import { useEffect, useRef, useState } from 'react'
import type { SearchHit, SearchResult } from '../../../main/search'
import { CHAT_MIME, useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { Icon } from './Icon'

/**
 * Suche über alle Chats (Titel und Verläufe). Die Treffer öffnen den Chat an der gefundenen Stelle –
 * wie im Board: Klick in die zuletzt benutzte Zelle, ⌘-Klick in eine neue, oder Treffer in eine Zelle ziehen.
 */
export function SearchBox({ onResults }: { onResults: (r: SearchResult[] | null) => void }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        ref.current?.focus()
        ref.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) {
      onResults(null)
      return
    }
    let current = true
    const timer = setTimeout(() => {
      void window.api.search(text).then((r) => current && onResults(r))
    }, 180)
    return () => {
      current = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="search-box">
      <Icon name="search" size={14} />
      <input
        ref={ref}
        value={q}
        placeholder="Alle Chats durchsuchen (⌘F)"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (setQ(''), e.currentTarget.blur())}
      />
      {q && (
        <button className="icon-btn search-clear" title="Suche leeren" onClick={() => setQ('')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}

/** Trefferliste an Stelle der Chatliste. */
export function SearchResults({ results }: { results: SearchResult[] }) {
  if (!results.length) return <p className="muted small pad">Nichts gefunden.</p>
  return (
    <ul className="search-results">
      {results.map((r) => (
        <li key={r.chatId}>
          <ChatRow r={r} />
          {r.hits.map((h) => (
            <HitRow key={h.itemId} chatId={r.chatId} hit={h} />
          ))}
          {r.total > r.hits.length && <div className="search-more muted small">… und {r.total - r.hits.length} weitere Stellen</div>}
        </li>
      ))}
    </ul>
  )
}

function ChatRow({ r }: { r: SearchResult }) {
  const open = (newCell: boolean): void => void openChat(r.chatId, undefined, newCell)
  return (
    <div
      className={`search-chat${r.inTitle ? ' match' : ''}`}
      role="button"
      tabIndex={0}
      draggable
      title={`${r.title}\nKlick: öffnen · ⌘-Klick: in neuer Zelle · Ziehen: in eine Zelle legen`}
      onDragStart={(e) => startDrag(e, r.chatId)}
      onDragEnd={() => useStore.getState().setDragging(null)}
      onClick={(e) => open(e.metaKey)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.metaKey))}
    >
      <AgentLogo agent={r.agent} size={13} />
      <span className="search-chat-title">{r.title}</span>
    </div>
  )
}

function HitRow({ chatId, hit }: { chatId: string; hit: SearchHit }) {
  const open = (newCell: boolean): void => void openChat(chatId, hit.itemId, newCell)
  return (
    <div
      className={`search-hit ${hit.role}`}
      role="button"
      tabIndex={0}
      draggable
      title="Klick: an dieser Stelle öffnen · ⌘-Klick: in neuer Zelle · Ziehen: in eine Zelle legen"
      onDragStart={(e) => startDrag(e, chatId, hit.itemId)}
      onDragEnd={() => useStore.getState().setDragging(null)}
      onClick={(e) => open(e.metaKey)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.metaKey))}
    >
      <span className="search-role">{hit.role === 'user' ? 'Frage' : hit.role === 'assistant' ? 'Antwort' : 'Hinweis'}</span>
      <span className="search-snippet">{hit.snippet}</span>
    </div>
  )
}

function startDrag(e: React.DragEvent, chatId: string, itemId?: string): void {
  e.dataTransfer.setData(CHAT_MIME, chatId)
  e.dataTransfer.effectAllowed = 'move'
  useStore.getState().setDragging({ chatId, ...(itemId ? { itemId } : {}) })
}

async function openChat(chatId: string, itemId: string | undefined, newCell: boolean): Promise<void> {
  const st = useStore.getState()
  if (newCell) await st.openInNewCell(chatId)
  else await st.openChat(chatId)
  if (itemId) st.jumpTo({ chatId, itemId })
}
