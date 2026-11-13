import { useEffect, useMemo, useState } from 'react'
import { boardModel, sameAsTitle, type BoardModel, type BoardNode } from '@shared/board'
import * as L from '@shared/layout'
import { CHAT_MIME, useStore } from '../store'
import { AgentLogo } from './AgentLogo'

const ROW = 30
const LANE = 20
const PAD = 14
/** Farben der Spuren (in beiden Themes lesbar). */
const COLORS = ['#d97757', '#4a8fd9', '#3fa66b', '#a970d6', '#d9a441', '#d95f8c', '#3fb0b0', '#8a8f98']
const colorOf = (lane: number): string => COLORS[lane % COLORS.length]
const x = (lane: number): number => PAD + lane * LANE
const y = (row: number): number => row * ROW + ROW / 2

/**
 * Diskursboard (nur ansehen): Graph eines Chat-Baums wie `git log --graph`. Zeit läuft nach unten,
 * jede Spur ein Chat, jeder Knoten eine Nutzernachricht. Klick öffnet den Chat an dieser Stelle
 * in der Zelle neben dem Board (⌘-Klick: in einer neuen Zelle; oder Knoten auf eine Zelle ziehen); Klick auf den Knoten einer Abzweigstelle klappt die dort abgehenden Äste
 * ein bzw. auf.
 */
export function Board({ rootId, cellId }: { rootId: string; cellId: string }) {
  const chats = useStore((s) => s.chats)
  const transcripts = useStore((s) => s.transcripts)
  const busy = useStore((s) => s.busy)
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(rootId))
  // Zusammenführen: Knoten auf eine andere Spur ziehen – diese Spur leuchtet auf.
  const [dropLane, setDropLane] = useState<string | null>(null)
  const dragging = useStore((s) => s.dragging)
  useEffect(() => {
    if (!dragging) setDropLane(null)
  }, [dragging])
  const mergeSource = (): { chatId: string; itemId?: string } | null => {
    const d = useStore.getState().dragging
    return d?.chatId && d.fromCell === cellId ? { chatId: d.chatId, itemId: d.itemId } : null
  }
  const update = (fn: (next: Set<string>) => void): void => {
    const next = new Set(hidden)
    fn(next)
    setHidden(next)
    writeHidden(rootId, next)
  }
  const toggle = (chatId: string): void => update((h) => (h.has(chatId) ? h.delete(chatId) : h.add(chatId)))
  // Hervorgehoben wird der zuletzt markierte Chat – aber nur, solange er in einer Zelle offen ist.
  const active = useStore((s) => (s.activeChatId && L.findCellOfChat(s.layout.root, s.activeChatId) ? s.activeChatId : null))
  const model = useMemo(() => boardModel(chats, transcripts, rootId, hidden), [chats, transcripts, rootId, hidden])
  // Markiert wird genau ein Knoten: der Turn, der im aktiven Chat gerade oben sichtbar ist (sonst sein erster).
  const viewItem = useStore((s) => (active ? s.viewTurn[active] : undefined))
  const activeNode = active
    ? (model.nodes.find((n) => n.chatId === active && n.itemId === viewItem) ?? model.nodes.find((n) => n.chatId === active))
    : undefined
  // Alle Transkripte des Baums laden (auch eingeklappte Äste – für die Zähler – und nicht offene Chats).
  const treeIds = useMemo(() => {
    const ids = new Set([rootId])
    let grew = true
    while (grew) {
      grew = false
      for (const c of chats) if (c.forkFrom && ids.has(c.forkFrom.chatId) && !ids.has(c.id)) (ids.add(c.id), (grew = true))
    }
    return [...ids].join('|')
  }, [chats, rootId])
  useEffect(() => {
    useStore.getState().ensureTranscripts(treeIds.split('|'))
  }, [treeIds])

  if (!model.lanes.length) return <div className="muted center-hint">Dieser Chat existiert nicht mehr.</div>
  const width = x(model.lanes.length - 1) + PAD
  const height = Math.max(1, model.nodes.length) * ROW
  const firstOfLane = new Set(model.lanes.map((l) => `${l.chatId}:${l.first}`))
  const lastOfLane = new Map(model.lanes.map((l) => [l.chatId, l.last]))
  const dropTitle = dropLane ? model.lanes.find((l) => l.chatId === dropLane)?.title : undefined
  const foldedAt = new Map<number, BoardModel['collapsed']>()
  for (const f of model.collapsed) if (f.row !== undefined) foldedAt.set(f.row, [...(foldedAt.get(f.row) ?? []), f])

  return (
    <div className="board">
      <div className="board-scroll">
        {model.nodes.length === 0 ? (
          <div className="muted center-hint">Noch keine Nachrichten.</div>
        ) : (
          <div className="board-canvas" style={{ height }}>
            <Graph
              model={model}
              width={width}
              height={height}
              activeNode={activeNode}
              onFork={(f) => update((h) => (f.open.length ? f.open.forEach((id) => h.add(id)) : f.closed.forEach((id) => h.delete(id))))}
            />
            {model.nodes.map((n) => {
              const lane = model.lanes[n.lane]
              const running = busy[n.chatId] && lastOfLane.get(n.chatId) === n.row
              const first = firstOfLane.has(`${n.chatId}:${n.row}`)
              // Titel nur zeigen, wenn er mehr sagt als die Nachricht selbst (Standardtitel = Anfang der ersten Nachricht).
              const titleRepeats = sameAsTitle(lane.title, n.text)
              const open = (newCell = false): void => void useStore.getState().openFromBoard(cellId, n.chatId, n.itemId, newCell)
              return (
                <div
                  key={`${n.chatId}:${n.itemId}`}
                  role="button"
                  tabIndex={0}
                  className={`board-row ${n.kind}${n === activeNode ? ' active' : ''}${n.chatId === dropLane ? ' merge-target' : ''}`}
                  style={{ top: n.row * ROW, height: ROW, paddingLeft: width + 6 }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CHAT_MIME, n.chatId)
                    e.dataTransfer.effectAllowed = 'move'
                    useStore.getState().setDragging({ chatId: n.chatId, itemId: n.itemId, fromCell: cellId })
                  }}
                  onDragEnd={() => useStore.getState().setDragging(null)}
                  onDragOver={(e) => {
                    const src = mergeSource()
                    if (!src || src.chatId === n.chatId) {
                      if (dropLane) setDropLane(null)
                      return
                    }
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dropLane !== n.chatId) setDropLane(n.chatId)
                  }}
                  onDrop={(e) => {
                    const src = mergeSource()
                    if (!src || src.chatId === n.chatId) return
                    e.preventDefault()
                    useStore.getState().setDragging(null)
                    setDropLane(null)
                    useStore.getState().openMerge({ sourceId: src.chatId, sourceItemId: src.itemId, targetId: n.chatId })
                  }}
                  onClick={(e) => open(e.metaKey)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.metaKey))}
                >
                  <span className="board-bar" style={{ background: colorOf(lane.color) }} />
                  {first && (
                    <span className={`board-chip${titleRepeats ? ' bare' : ''}`} style={{ borderColor: colorOf(lane.color) }}>
                      <AgentLogo agent={lane.agent} size={11} />
                      {!titleRepeats && lane.title}
                    </span>
                  )}
                  <span className="board-label">
                    {n.kind === 'steer' ? '⚡ ' : n.kind === 'merge' ? '⤵ ' : n.kind === 'prepare' ? '⤴ ' : ''}
                    {n.label}
                  </span>
                  {foldedAt.get(n.row)?.map((f) => (
                    <button
                      key={f.chatId}
                      className="board-folded"
                      style={{ borderColor: colorOf(f.color), color: colorOf(f.color) }}
                      title={`Eingeklappter Ast aufklappen: ${f.chats} ${f.chats === 1 ? 'Chat' : 'Chats'}, ${f.messages} ${f.messages === 1 ? 'Nachricht' : 'Nachrichten'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(f.chatId)
                      }}
                    >
                      ▸ <span className="board-folded-title">{f.title}</span> · {f.messages}
                    </button>
                  ))}
                  {n.chatId === dropLane && lastOfLane.get(n.chatId) === n.row && (
                    <span className="board-merge-hint">⤵ hier zusammenführen{dropTitle ? ` (in „${dropTitle}“)` : ''}</span>
                  )}
                  {running && <span className="spinner" />}
                  <span className="board-time">{time(n.ts)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Eingeklappte Äste je Board (pro Rechner, im localStorage).
const hiddenKey = (rootId: string): string => `c2ui.boardHidden.${rootId}`
function readHidden(rootId: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(hiddenKey(rootId)) ?? '[]'))
  } catch {
    return new Set()
  }
}
function writeHidden(rootId: string, ids: Set<string>): void {
  try {
    if (ids.size) localStorage.setItem(hiddenKey(rootId), JSON.stringify([...ids]))
    else localStorage.removeItem(hiddenKey(rootId))
  } catch {
    /* egal */
  }
}

/** Abzweigstelle: Zeile im Ursprung mit den dort abgehenden Ästen (offen bzw. eingeklappt). */
interface Fork {
  row: number
  open: string[]
  closed: string[]
}

function forksOf(model: BoardModel): Map<number, Fork> {
  const forks = new Map<number, Fork>()
  const at = (row: number): Fork => forks.get(row) ?? (forks.set(row, { row, open: [], closed: [] }).get(row) as Fork)
  for (const e of model.edges) at(e.from.row).open.push(e.childId)
  for (const f of model.collapsed) if (f.row !== undefined) at(f.row).closed.push(f.chatId)
  return forks
}

function Graph({
  model,
  width,
  height,
  activeNode,
  onFork
}: {
  model: BoardModel
  width: number
  height: number
  activeNode?: BoardNode
  onFork: (f: Fork) => void
}) {
  const forks = forksOf(model)
  return (
    <svg className="board-graph" width={width} height={height}>
      {/* Wo man im aktiven Chat gerade ist: gelber Hof um den Knoten */}
      {activeNode && <circle className="board-active-node" cx={x(activeNode.lane)} cy={y(activeNode.row)} r={10} />}
      {/* Spuren */}
      {model.lanes.map((l) =>
        l.first !== undefined && l.last !== undefined && l.last > l.first ? (
          <line key={l.chatId} x1={x(l.lane)} y1={y(l.first)} x2={x(l.lane)} y2={y(l.last)} stroke={colorOf(l.color)} strokeWidth={2} />
        ) : null
      )}
      {/* Abzweigungen: aus dem Ursprung in die Spur des Nebenchats, dann senkrecht bis zum ersten Knoten */}
      {model.edges.map((e) => (
        <path key={e.childId} d={edgePath(e)} fill="none" stroke={colorOf(model.lanes[e.to.lane].color)} strokeWidth={2} />
      ))}
      {/* Zusammenführungen: aus dem Nebenchat senkrecht hinunter, dann in die Spur des Ziels */}
      {model.merges.map((m) => {
        const src = model.lanes.find((l) => l.chatId === m.sourceId)
        return (
          <path
            key={`m-${m.itemId}`}
            className="board-merge"
            d={mergePath(m)}
            fill="none"
            stroke={colorOf(src?.color ?? 0)}
            strokeWidth={2}
          />
        )
      })}
      {/* Knoten; an Abzweigstellen mit „−“ (Äste offen) bzw. „+“ (eingeklappt) – Klick klappt um */}
      {model.nodes.map((n) => {
        const color = colorOf(model.lanes[n.lane].color)
        const fork = forks.get(n.row)
        if (fork) {
          const open = fork.open.length > 0
          const cx = x(n.lane)
          const cy = y(n.row)
          return (
            <g
              key={n.itemId}
              className="board-fork"
              role="button"
              aria-label={open ? 'Äste einklappen' : 'Äste aufklappen'}
              data-state={open ? 'open' : 'closed'}
              onClick={(e) => {
                e.stopPropagation()
                onFork(fork)
              }}
            >
              <circle cx={cx} cy={cy} r={9} className="board-fork-hit" />
              <circle cx={cx} cy={cy} r={6.5} className="board-node" stroke={color} />
              <path
                d={`M ${cx - 3} ${cy} h 6${open ? '' : ` M ${cx} ${cy - 3} v 6`}`}
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </g>
          )
        }
        if (n.kind === 'merge') {
          return <circle key={n.itemId} cx={x(n.lane)} cy={y(n.row)} r={5.5} className="board-node board-node-merge" stroke={color} style={{ fill: color }} />
        }
        return n.kind === 'action' ? (
          <rect key={n.itemId} x={x(n.lane) - 4} y={y(n.row) - 4} width={8} height={8} rx={2} className="board-node" stroke={color} />
        ) : (
          <circle key={n.itemId} cx={x(n.lane)} cy={y(n.row)} r={n.kind === 'steer' ? 3.5 : 5} className="board-node" stroke={color} />
        )
      })}
    </svg>
  )
}

/** Abzweigung: aus dem Ursprung in die Spur des Nebenchats, dann senkrecht bis zu seinem ersten Knoten. */
function edgePath(e: BoardModel['edges'][number]): string {
  const x1 = x(e.from.lane)
  const y1 = y(e.from.row)
  const x2 = x(e.to.lane)
  const yb = Math.min(y(e.to.row), y1 + ROW * 0.9)
  const mid = (y1 + yb) / 2
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${yb} L ${x2} ${y(e.to.row)}`
}

/** Zusammenführung: in der Spur des Nebenchats hinunter bis kurz vor die Übernahme, dann hinüber ins Ziel. */
function mergePath(m: BoardModel['merges'][number]): string {
  const x1 = x(m.from.lane)
  const y1 = y(m.from.row)
  const x2 = x(m.to.lane)
  const y2 = y(m.to.row)
  const yb = Math.max(y1, y2 - ROW * 0.9)
  const mid = (yb + y2) / 2
  return `M ${x1} ${y1} L ${x1} ${yb} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
}

function time(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === today.toDateString() ? hm : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`
}
