import { useMemo } from 'react'
import { forkChain } from '@shared/forks'
import { useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { Icon } from './Icon'

/** Markierung im Ursprung an der Abzweigstelle: „↳ Nachfrage …“, Klick öffnet den Nebenchat daneben. */
export function ForkMarkers({ chatId, childIds }: { chatId: string; childIds: string[] }) {
  const chats = useStore((s) => s.chats)
  const busy = useStore((s) => s.busy)
  const children = childIds.map((id) => chats.find((c) => c.id === id)).filter((c) => !!c)
  if (!children.length) return null
  return (
    <div className="fork-markers">
      <span className="fork-markers-label">
        ↳ {children.length === 1 ? 'Nachfrage' : `${children.length} Nachfragen`}
      </span>
      {children.map((c) => {
        const quote = c.forkFrom?.at?.quote
        return (
          <button
            key={c.id}
            className="fork-pill"
            data-fork-child={c.id}
            title={`Nebenchat „${c.title}“ daneben öffnen${quote ? `\nZitat: „${quote.slice(0, 160)}${quote.length > 160 ? '…' : ''}“` : ''}`}
            onClick={() => void useStore.getState().openBeside(c.id, chatId, 'after')}
          >
            {busy[c.id] ? <span className="spinner" /> : <AgentLogo agent={c.agent} size={12} />}
            <span className="fork-pill-title">{c.title}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Brotkrumen im Nebenchat (an Stelle des Hinweises „Abgezweigt aus …“): Klick auf ein Glied öffnet
 * diesen Chat links daneben und springt an die Stelle, an der der Weg hierher abzweigt.
 */
export function ForkBreadcrumb({ chatId }: { chatId: string }) {
  const chats = useStore((s) => s.chats)
  const chain = useMemo(() => forkChain(chats, chatId), [chats, chatId])
  if (!chain.length) return null
  const open = (target: string, childId: string): void => {
    const st = useStore.getState()
    void st.openBeside(target, chatId, 'before').then(() => st.jumpTo({ chatId: target, forkChild: childId }))
  }
  return (
    <div className="msg msg-notice fork-crumbs">
      <Icon name="info" size={14} />
      <span>
        Abgezweigt aus{' '}
        {chain.map((l, i) => (
          <span key={l.childId}>
            {i > 0 && <span className="crumb-sep"> › </span>}
            {l.chatId ? (
              <button className="crumb" title="Öffnen und zur Abzweigstelle springen" onClick={() => open(l.chatId!, l.childId)}>
                {l.title}
              </button>
            ) : (
              <span className="crumb gone" title="Dieser Chat wurde gelöscht">
                {l.title}
              </span>
            )}
          </span>
        ))}
        <span className="muted"> – der bisherige Verlauf ist bekannt. Screens von dort erscheinen hier nicht.</span>
      </span>
    </div>
  )
}
