import { useEffect, useMemo, useState } from 'react'
import { boardModel, sameAsTitle, type BoardModel, type BoardNode } from '@shared/board'
import * as L from '@shared/layout'
import { useStore } from '../store'
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
 * in der Zelle neben dem Board.
 */
export function Board({ rootId, cellId }: { rootId: string; cellId: string }) {
  const chats = useStore((s) => s.chats)
  const transcripts = useStore((s) => s.transcripts)
  const busy = useStore((s) => s.busy)
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(rootId))
  const toggle = (chatId: string): void => {
    const next = new Set(hidden)
    if (next.has(chatId)) next.delete(chatId)
    else next.add(chatId)
    setHidden(next)
    writeHidden(rootId, next)
  }
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
  const foldedAt = new Map<number, BoardModel['collapsed']>()
  for (const f of model.collapsed) if (f.row !== undefined) foldedAt.set(f.row, [...(foldedAt.get(f.row) ?? []), f])

  return (
    <div className="board">
      <div className="board-scroll">
        {model.nodes.length === 0 ? (
          <div className="muted center-hint">Noch keine Nachrichten.</div>
        ) : (
          <div className="board-canvas" style={{ height }}>
            <Graph model={model} width={width} height={height} activeNode={activeNode} />
            {model.nodes.map((n) => {
              const lane = model.lanes[n.lane]
              const running = busy[n.chatId] && lastOfLane.get(n.chatId) === n.row
              const first = firstOfLane.has(`${n.chatId}:${n.row}`)
              // Titel nur zeigen, wenn er mehr sagt als die Nachricht selbst (Standardtitel = Anfang der ersten Nachricht).
              const titleRepeats = sameAsTitle(lane.title, n.text)
              const open = (): void => void useStore.getState().openFromBoard(cellId, n.chatId, n.itemId)
              return (
                <div
                  key={`${n.chatId}:${n.itemId}`}
                  role="button"
                  tabIndex={0}
                  className={`board-row ${n.kind}${n === activeNode ? ' active' : ''}`}
                  style={{ top: n.row * ROW, height: ROW, paddingLeft: width + 6 }}
                  onClick={open}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
                >
                  {first && n.lane > 0 && (
                    <button
                      className="board-fold"
                      title="Ast einklappen"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(n.chatId)
                      }}
                    >
                      ▾
                    </button>
                  )}
                  {first && (
                    <span className={`board-chip${titleRepeats ? ' bare' : ''}`} style={{ borderColor: colorOf(lane.color) }}>
                      <AgentLogo agent={lane.agent} size={11} />
                      {!titleRepeats && lane.title}
                    </span>
                  )}
                  <span className="board-label">
                    {n.kind === 'steer' ? '⚡ ' : ''}
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

function Graph({ model, width, height, activeNode }: { model: BoardModel; width: number; height: number; activeNode?: BoardNode }) {
  return (
    <svg className="board-graph" width={width} height={height} aria-hidden>
      {/* Wo man im aktiven Chat gerade ist: gelber Hof um den Knoten */}
      {activeNode && <circle className="board-active-node" cx={x(activeNode.lane)} cy={y(activeNode.row)} r={10} />}
      {/* Spuren */}
      {model.lanes.map((l) =>
        l.first !== undefined && l.last !== undefined && l.last > l.first ? (
          <line key={l.chatId} x1={x(l.lane)} y1={y(l.first)} x2={x(l.lane)} y2={y(l.last)} stroke={colorOf(l.color)} strokeWidth={2} />
        ) : null
      )}
      {/* Abzweigungen: aus dem Ursprung in die Spur des Nebenchats, dann senkrecht bis zum ersten Knoten */}
      {model.edges.map((e) => {
        return (
          <path
            key={e.childId}
            d={edgePath(e)}
            fill="none"
            stroke={colorOf(model.lanes[e.to.lane].color)}
            strokeWidth={2}
          />
        )
      })}
      {/* Eingeklappte Äste: kurzer gestrichelter Ansatz an der Abzweigstelle */}
      {model.collapsed.map((f) =>
        f.row === undefined ? null : (
          <path
            key={f.chatId}
            d={`M ${x(f.lane)} ${y(f.row)} q 4 10 14 12`}
            fill="none"
            stroke={colorOf(f.color)}
            strokeWidth={2}
            strokeDasharray="2 3"
          />
        )
      )}
      {/* Knoten */}
      {model.nodes.map((n) =>
        n.kind === 'action' ? (
          <rect key={n.itemId} x={x(n.lane) - 4} y={y(n.row) - 4} width={8} height={8} rx={2} className="board-node" stroke={colorOf(model.lanes[n.lane].color)} />
        ) : (
          <circle key={n.itemId} cx={x(n.lane)} cy={y(n.row)} r={n.kind === 'steer' ? 3.5 : 5} className="board-node" stroke={colorOf(model.lanes[n.lane].color)} />
        )
      )}
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

function time(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === today.toDateString() ? hm : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`
}
