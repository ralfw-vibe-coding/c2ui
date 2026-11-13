import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chat } from '@shared/types'
import { blockOfRange, findQuoteRange } from '../textRange'
import { forkChain } from '@shared/forks'
import { useStore } from '../store'
import { AgentLogo } from './AgentLogo'
import { Icon } from './Icon'

/**
 * Markierungen im Ursprung: „↳ Nachfrage …“, Klick öffnet den Nebenchat daneben.
 * Gerendert nach der Antwort, aus der zitiert wurde; findet sich das Zitat dort, wandert die Markierung
 * direkt hinter den Absatz bzw. Listenpunkt mit dem Zitat (per Portal in einen eingefügten Platzhalter).
 */
export function ForkMarkers({ chatId, childIds }: { chatId: string; childIds: string[] }) {
  const chats = useStore((s) => s.chats)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [slots, setSlots] = useState<{ el: HTMLElement; ids: string[] }[]>([])
  const children = childIds.map((id) => chats.find((c) => c.id === id)).filter((c): c is Chat => !!c)
  const key = children.map((c) => `${c.id}:${c.forkFrom?.at?.itemId ?? ''}:${c.forkFrom?.at?.quote ?? ''}`).join('|')

  useLayoutEffect(() => {
    const transcript = anchorRef.current?.closest('.transcript')
    if (!transcript) return
    const created: HTMLElement[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    const place = (): boolean => {
      const byBlock = new Map<HTMLElement, string[]>()
      let missing = false
      for (const c of children) {
        const at = c.forkFrom?.at
        if (!at?.itemId || !at.quote) continue
        const roots = [...transcript.querySelectorAll<HTMLElement>(`.unit[data-item-id="${CSS.escape(at.itemId)}"]`)]
        const range = findQuoteRange(roots, at.quote)
        const block = range && blockOfRange(range, roots)
        if (!block) {
          missing = true
          continue
        }
        byBlock.set(block, [...(byBlock.get(block) ?? []), c.id])
      }
      const next = [...byBlock].map(([block, ids]) => {
        const el = document.createElement('div')
        el.className = 'fork-slot'
        // Im Listenpunkt ans Ende (eingerückt wie der Punkt), sonst direkt hinter den Block.
        if (block.tagName === 'LI') block.appendChild(el)
        else block.after(el)
        created.push(el)
        return { el, ids }
      })
      setSlots(next)
      return !missing
    }
    // Inhalte (Markdown, Bilder) können einen Moment später stehen: einmal nachfassen.
    if (!place()) {
      timer = setTimeout(() => {
        for (const el of created.splice(0)) el.remove()
        place()
      }, 400)
    }
    return () => {
      if (timer) clearTimeout(timer)
      for (const el of created) el.remove()
      setSlots([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!children.length) return null
  const placed = new Set(slots.flatMap((s) => s.ids))
  const rest = children.filter((c) => !placed.has(c.id))
  return (
    <>
      <span ref={anchorRef} hidden />
      {rest.length > 0 && <MarkerRow chatId={chatId} forks={rest} />}
      {slots.map((s, i) =>
        createPortal(<MarkerRow chatId={chatId} forks={children.filter((c) => s.ids.includes(c.id))} />, s.el, String(i))
      )}
    </>
  )
}

function MarkerRow({ chatId, forks }: { chatId: string; forks: Chat[] }) {
  const busy = useStore((s) => s.busy)
  return (
    <div className="fork-markers">
      <span className="fork-markers-label">↳ {forks.length === 1 ? 'Nachfrage' : `${forks.length} Nachfragen`}</span>
      {forks.map((c) => {
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
