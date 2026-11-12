import { memo, useState } from 'react'
import { shortToolName, toUnits, type Unit } from '@shared/turns'
import type { Block, Transcript } from '@shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'
import { BlockView, TranscriptItemView } from './Message'

/** Gemerkte Auf-/Zu-Zustände der Schrittgruppen (über Neu-Einhängen hinweg). */
const openGroups = new Set<string>()

/** Transkript mit einklappbaren Arbeitsschritten je Turn (siehe toUnits). */
export function TranscriptView({ chatId, transcript, busy }: { chatId: string; transcript: Transcript; busy: boolean }) {
  const collapse = useStore((s) => s.settings?.collapseSteps !== false)
  const units = toUnits(transcript, collapse)
  return (
    <>
      {units.map((u) => (
        <UnitView key={u.key} unit={u} chatId={chatId} running={busy && u.kind === 'steps' && u.lastTurn} />
      ))}
    </>
  )
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
