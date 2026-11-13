import { useEffect, useMemo } from 'react'
import { boardModel, sameAsTitle, type BoardModel } from '@shared/board'
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
  const active = useStore((s) => s.activeChatId)
  const model = useMemo(() => boardModel(chats, transcripts, rootId), [chats, transcripts, rootId])
  const laneIds = model.lanes.map((l) => l.chatId).join('|')

  // Alle Transkripte des Baums laden (auch die der Chats, die gerade in keiner Zelle offen sind).
  useEffect(() => {
    useStore.getState().ensureTranscripts(laneIds.split('|').filter(Boolean))
  }, [laneIds])

  if (!model.lanes.length) return <div className="muted center-hint">Dieser Chat existiert nicht mehr.</div>
  const width = x(model.lanes.length - 1) + PAD
  const height = Math.max(1, model.nodes.length) * ROW
  const firstOfLane = new Set(model.lanes.map((l) => `${l.chatId}:${l.first}`))
  const lastOfLane = new Map(model.lanes.map((l) => [l.chatId, l.last]))

  return (
    <div className="board">
      <div className="board-legend">
        {model.lanes.map((l) => (
          <span key={l.chatId} className={`board-legend-item${l.chatId === active ? ' active' : ''}`} title={l.title}>
            <span className="board-swatch" style={{ background: colorOf(l.lane) }} />
            {l.title}
          </span>
        ))}
      </div>
      <div className="board-scroll">
        {model.nodes.length === 0 ? (
          <div className="muted center-hint">Noch keine Nachrichten.</div>
        ) : (
          <div className="board-canvas" style={{ height }}>
            <Graph model={model} width={width} height={height} active={active} />
            {model.nodes.map((n) => {
              const lane = model.lanes[n.lane]
              const running = busy[n.chatId] && lastOfLane.get(n.chatId) === n.row
              // Titel nur zeigen, wenn er mehr sagt als die Nachricht selbst (Standardtitel = Anfang der ersten Nachricht).
              const titleRepeats = sameAsTitle(lane.title, n.text)
              return (
                <button
                  key={`${n.chatId}:${n.itemId}`}
                  className={`board-row ${n.kind}${n.chatId === active ? ' active' : ''}`}
                  style={{ top: n.row * ROW, height: ROW, paddingLeft: width + 6 }}
                  onClick={() => void useStore.getState().openFromBoard(cellId, n.chatId, n.itemId)}
                >
                  {firstOfLane.has(`${n.chatId}:${n.row}`) && (
                    <span className={`board-chip${titleRepeats ? ' bare' : ''}`} style={{ borderColor: colorOf(n.lane) }}>
                      <AgentLogo agent={lane.agent} size={11} />
                      {!titleRepeats && lane.title}
                    </span>
                  )}
                  <span className="board-label">
                    {n.kind === 'steer' ? '⚡ ' : ''}
                    {n.label}
                  </span>
                  {running && <span className="spinner" />}
                  <span className="board-time">{time(n.ts)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Graph({ model, width, height, active }: { model: BoardModel; width: number; height: number; active: string | null }) {
  const al = model.lanes.find((l) => l.chatId === active)
  const activeEdge = model.edges.find((e) => e.childId === active)
  return (
    <svg className="board-graph" width={width} height={height} aria-hidden>
      {/* Aktiver Chat: gelbe Spur unter der farbigen (von der Abzweigstelle bis zum letzten Knoten) */}
      {al?.first !== undefined && al.last !== undefined && (
        <line
          className="board-active-lane"
          x1={x(al.lane)}
          y1={activeEdge ? y(activeEdge.to.row) : y(al.first)}
          x2={x(al.lane)}
          y2={y(al.last)}
        />
      )}
      {activeEdge && <path className="board-active-lane" d={edgePath(activeEdge)} fill="none" />}
      {/* Spuren */}
      {model.lanes.map((l) =>
        l.first !== undefined && l.last !== undefined && l.last > l.first ? (
          <line key={l.chatId} x1={x(l.lane)} y1={y(l.first)} x2={x(l.lane)} y2={y(l.last)} stroke={colorOf(l.lane)} strokeWidth={2} />
        ) : null
      )}
      {/* Abzweigungen: aus dem Ursprung in die Spur des Nebenchats, dann senkrecht bis zum ersten Knoten */}
      {model.edges.map((e) => {
        return (
          <path
            key={e.childId}
            d={edgePath(e)}
            fill="none"
            stroke={colorOf(e.to.lane)}
            strokeWidth={2}
          />
        )
      })}
      {/* Knoten */}
      {model.nodes.map((n) =>
        n.kind === 'action' ? (
          <rect key={n.itemId} x={x(n.lane) - 4} y={y(n.row) - 4} width={8} height={8} rx={2} className="board-node" stroke={colorOf(n.lane)} />
        ) : (
          <circle key={n.itemId} cx={x(n.lane)} cy={y(n.row)} r={n.kind === 'steer' ? 3.5 : 5} className="board-node" stroke={colorOf(n.lane)} />
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
