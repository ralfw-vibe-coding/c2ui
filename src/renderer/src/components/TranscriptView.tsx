import { memo, useMemo, useState } from 'react'
import { forkAnchors } from '@shared/forks'
import { shortToolName, toUnits, type Unit } from '@shared/turns'
import type { Block, Transcript } from '@shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'
import { BlockView, TranscriptItemView } from './Message'
import { ForkBreadcrumb, ForkMarkers } from './Forks'

/** Gemerkte Auf-/Zu-Zustände der Schrittgruppen (über Neu-Einhängen hinweg). */
const openGroups = new Set<string>()

/** Transkript mit einklappbaren Arbeitsschritten je Turn (siehe toUnits). */
export function TranscriptView({ chatId, transcript, busy }: { chatId: string; transcript: Transcript; busy: boolean }) {
  const collapse = useStore((s) => s.settings?.collapseSteps !== false)
  const units = toUnits(transcript, collapse)
  const chats = useStore((s) => s.chats)
  const isFork = useMemo(() => !!chats.find((c) => c.id === chatId)?.forkFrom, [chats, chatId])
  // Nebenchats dieses Chats → Markierungen an ihren Abzweigstellen.
  const anchors = useMemo(() => {
    const children = chats.filter((c) => c.forkFrom?.chatId === chatId).sort((a, b) => a.createdAt - b.createdAt)
    if (!children.length) return new Map<number, string[]>()
    return forkAnchors(
      units.map((u) => ({ itemId: itemIdOf(u), isUser: u.kind === 'item' && u.item.type === 'user' })),
      children.map((c) => ({ id: c.id, at: c.forkFrom?.at }))
    )
  }, [chats, chatId, units])
  return (
    <>
      {units.map((u, i) => (
        // display: contents – nur für die Zuordnung (Abzweigpunkt), ohne das Layout zu ändern.
        <div key={u.key} className="unit" data-item-id={itemIdOf(u)}>
          {isFork && u.kind === 'item' && u.item.type === 'notice' && u.item.text.startsWith('Abgezweigt aus') ? (
            <ForkBreadcrumb chatId={chatId} />
          ) : (
            <UnitView unit={u} chatId={chatId} running={busy && u.kind === 'steps' && u.lastTurn} />
          )}
          {anchors.has(i) && <ForkMarkers chatId={chatId} childIds={anchors.get(i)!} />}
        </div>
      ))}
    </>
  )
}

/** Transkript-Eintrag, zu dem eine Darstellungseinheit gehört. */
function itemIdOf(u: Unit): string {
  if (u.kind === 'item') return u.item.id
  const key = u.kind === 'block' ? u.key : u.blocks[0]?.key ?? u.key
  return key.slice(0, key.lastIndexOf(':') >= 0 ? key.lastIndexOf(':') : key.length)
}

const UnitView = memo(function UnitView({ unit, chatId, running }: { unit: Unit; chatId: string; running: boolean }) {
  if (unit.kind === 'item') return <TranscriptItemView item={unit.item} chatId={chatId} />
  if (unit.kind === 'block') {
    return (
      <div className="msg msg-assistant">
        <BlockView block={unit.block} chatId={chatId} />
      </div>
    )
  }
  return <StepsGroup groupKey={unit.key} blocks={unit.blocks} chatId={chatId} running={running} />
})

function StepsGroup({ groupKey, blocks, chatId, running }: { groupKey: string; blocks: { key: string; block: Block }[]; chatId: string; running: boolean }) {
  const [open, setOpen] = useState(() => openGroups.has(groupKey))
  const tools = blocks.filter((b) => b.block.type === 'tool_use').map((b) => shortToolName((b.block as { name: string }).name))
  const failed = blocks.some((b) => b.block.type === 'tool_use' && (b.block as { result?: { isError: boolean } }).result?.isError)
  const names = [...new Set(tools)].slice(0, 4).join(', ') + (new Set(tools).size > 4 ? ', …' : '')
  const last = blocks[blocks.length - 1].block
  const current = last.type === 'tool_use' ? `${shortToolName(last.name)} ${summaryOf(last.input)}` : last.type === 'thinking' ? 'denkt nach …' : 'schreibt …'
  const toggle = (): void => {
    if (open) openGroups.delete(groupKey)
    else openGroups.add(groupKey)
    setOpen(!open)
  }
  return (
    <div className={`steps${open ? ' open' : ''}`}>
      <button className="steps-head" onClick={toggle} title={open ? 'Arbeitsschritte einklappen' : 'Arbeitsschritte anzeigen'}>
        <span className="steps-chevron">{open ? '▾' : '▸'}</span>
        {running ? (
          <span className="spinner" />
        ) : (
          <span className={`steps-status ${failed ? 'fail' : 'ok'}`}>
            <Icon name={failed ? 'alert' : 'check'} size={13} />
          </span>
        )}
        <span className="steps-count">
          {blocks.length} {blocks.length === 1 ? 'Arbeitsschritt' : 'Arbeitsschritte'}
        </span>
        <span className="steps-names">{running ? current : names}</span>
      </button>
      {open && (
        <div className="steps-body">
          {blocks.map((b) => (
            <BlockView key={b.key} block={b.block} chatId={chatId} />
          ))}
        </div>
      )}
    </div>
  )
}

function summaryOf(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  for (const k of ['description', 'file_path', 'path', 'command', 'pattern', 'query', 'skill']) {
    const v = o[k]
    if (typeof v === 'string' && v) return v.length > 70 ? v.slice(0, 67) + '…' : v
  }
  return ''
}
