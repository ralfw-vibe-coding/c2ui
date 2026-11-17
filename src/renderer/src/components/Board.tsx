import { useEffect, useMemo, useState } from 'react'
import { boardModel, branchesInRange, nodeOfItem, sameAsTitle, type BoardModel, type BoardNode } from '@shared/board'
import type { BoardGroup } from '@shared/types'
import type { ChatComment } from '@shared/types'
import * as L from '@shared/layout'
import { CHAT_MIME, useStore } from '../store'
import { Icon } from './Icon'
import { AgentLogo } from './AgentLogo'

const ROW = 30
const LANE = 20
const PAD = 14
/** Abstand der Klammern geschachtelter Gruppen. */
const BRACKET = 10
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
  /** Inhaltsverzeichnis auf- oder zugeklappt und wie breit (bleibt so, auch beim nächsten Board). */
  const [tocOpen, setTocOpen] = useState(readTocOpen)
  const [tocWidth, setTocWidth] = useState(readTocWidth)
  /** Breite per Ziehen am linken Rand; Doppelklick setzt sie zurück. */
  const startResize = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = tocWidth
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-col')
    let w = startW
    const move = (ev: PointerEvent): void => {
      // Nach links ziehen macht breiter: das Verzeichnis liegt am rechten Rand.
      w = clampTocWidth(startW - (ev.clientX - startX))
      setTocWidth(w)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing-col')
      writeTocWidth(w)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
  const groups = useStore((s) => s.groups[rootId])
  useEffect(() => void useStore.getState().ensureGroups(rootId), [rootId])
  /** Markierte Strecke: Anker (erster Klick) und Ende (⇧-Klick), beide in derselben Spur. */
  const [pick, setPick] = useState<{ chatId: string; from: string; to: string } | null>(null)
  const [name, setName] = useState('')
  /** Zuletzt angeklickte Zeile – Anker für ⇧-Klick (überlebt das Neueinhängen des Boards). */
  const anchor = anchors.get(rootId)
  const setAnchor = (a: { chatId: string; itemId: string } | null): void => {
    if (a) anchors.set(rootId, a)
    else anchors.delete(rootId)
  }
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
  /** Ziehen über einer Zeile bzw. einem Knoten der Spur `chatId` (Zeile und Abzweigknoten teilen sich das). */
  const laneDragOver = (chatId: string, e: React.DragEvent): void => {
    const src = mergeSource()
    if (!src || src.chatId === chatId) {
      if (dropLane) setDropLane(null)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropLane !== chatId) setDropLane(chatId)
  }
  const laneDrop = (chatId: string, e: React.DragEvent): void => {
    const src = mergeSource()
    if (!src || src.chatId === chatId) return
    e.preventDefault()
    e.stopPropagation()
    useStore.getState().setDragging(null)
    setDropLane(null)
    useStore.getState().openMerge({ sourceId: src.chatId, sourceItemId: src.itemId, targetId: chatId })
  }
  const update = (fn: (next: Set<string>) => void): void => {
    const next = new Set(hidden)
    fn(next)
    setHidden(next)
    writeHidden(rootId, next)
  }
  const toggle = (chatId: string): void => update((h) => (h.has(chatId) ? h.delete(chatId) : h.add(chatId)))
  /** Gruppen schreiben (anlegen, umbenennen, auf/zu, auflösen). */
  const setGroups = (list: BoardGroup[]): void => void useStore.getState().saveGroups(rootId, list)
  const toggleGroup = (groupId: string): void =>
    setGroups((groups ?? []).map((g) => (g.id === groupId ? { ...g, closed: !g.closed } : g)))
  const dropGroup = (groupId: string): void => setGroups((groups ?? []).filter((g) => g.id !== groupId))
  const makeGroup = (): void => {
    if (!pick) return
    const label = name.trim() || defaultName
    setGroups([
      ...(groups ?? []),
      // Offen angelegt: Es soll sich nichts bewegen, nur die Klammer kommt dazu. Zuklappen entscheidet man selbst.
      { id: `g-${Date.now().toString(36)}`, chatId: pick.chatId, fromItemId: pick.from, toItemId: pick.to, label, closed: false, createdAt: Date.now() }
    ])
    setPick(null)
    setName('')
  }
  // Hervorgehoben wird der zuletzt markierte Chat – aber nur, solange er in einer Zelle offen ist.
  const active = useStore((s) => (s.activeChatId && L.findCellOfChat(s.layout.root, s.activeChatId) ? s.activeChatId : null))
  // Markiert wird genau ein Knoten: der Turn, der im aktiven Chat gerade oben sichtbar ist (sonst sein erster).
  const viewItem = useStore((s) => (active ? s.viewTurn[active] : undefined))
  const model = useMemo(
    // Die gelesene Stelle bleibt sichtbar, auch wenn sie mitten in einer langen Strecke liegt.
    () => boardModel(chats, transcripts, rootId, { hidden, groups }),
    [chats, transcripts, rootId, hidden, groups]
  )
  // Markiert wird die Stelle, an der man im Chat gerade liest. Steckt sie in einer zugeklappten
  // Gruppe, markiert deren Zeile – aber nie ersatzweise der erste Knoten des Chats.
  const activeNode = active
    ? (model.nodes.find((n) => n.chatId === active && n.itemId === viewItem) ??
      (viewItem ? undefined : model.nodes.find((n) => n.chatId === active)))
    : undefined
  const activeRun =
    active && viewItem && !activeNode ? model.runs.find((r) => r.chatId === active && r.items.some((i) => i.itemId === viewItem)) : undefined

  // Vorschlag für den Namen: die erste Nachricht der Strecke, knapp.
  const defaultName = pick ? (model.nodes.find((n) => n.chatId === pick.chatId && n.itemId === pick.from)?.label ?? 'Gruppe').slice(0, 40) : ''
  const pickInfo = pick
    ? (() => {
        const ns = model.nodes.filter((n) => n.chatId === pick.chatId && inPick(model, pick, n))
        const rows = ns.map((n) => n.row)
        return {
          count: ns.length,
          /** Mitte der Strecke – dort steht die Leiste. */
          mid: (Math.min(...rows) + Math.max(...rows)) / 2,
          lane: ns[0]?.lane ?? 0,
          branches: branchesInRange(chats, transcripts, { chatId: pick.chatId, fromItemId: pick.from, toItemId: pick.to }).size
        }
      })()
    : null

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
  const comments = useStore((s) => s.comments)
  // Notizen je Knoten: eine Notiz zu einer Antwort gehört zum Knoten ihrer Frage.
  const notesOf = useMemo(() => {
    const map = new Map<string, ChatComment[]>()
    for (const [chatId, list] of Object.entries(comments)) {
      const node = nodeOfItem(transcripts[chatId] ?? [])
      for (const c of list ?? []) {
        const key = `${chatId}:${node.get(c.itemId) ?? c.itemId}`
        map.set(key, [...(map.get(key) ?? []), c])
      }
    }
    return map
  }, [comments, transcripts])
  useEffect(() => {
    const ids = treeIds.split('|')
    useStore.getState().ensureTranscripts(ids)
    for (const id of ids) {
      useStore.getState().ensureComments(id)
      useStore.getState().ensureBookmarks(id)
    }
  }, [treeIds])
  const bookmarks = useStore((s) => s.bookmarks)
  /**
   * Inhaltsverzeichnis: alle Lesezeichen des Baums in der Reihenfolge des Diskurses, also nach der
   * Zeile ihres Turns im Graphen. Ohne eigene Beschriftung steht das Zitat bzw. die Nachricht da.
   */
  const toc = useMemo(() => {
    const ids = treeIds.split('|')
    const list: { chatId: string; id: string; row: number; lane: number; itemId: string; needle?: string; text: string; eigen: boolean }[] = []
    for (const chatId of ids) {
      const node = nodeOfItem(transcripts[chatId] ?? [])
      for (const b of bookmarks[chatId] ?? []) {
        const turn = node.get(b.itemId) ?? b.itemId
        const n = model.nodes.find((x) => x.chatId === chatId && x.itemId === turn)
        const run = n ? undefined : model.runs.find((r) => r.chatId === chatId && r.items.some((i) => i.itemId === turn))
        const row = n?.row ?? run?.row
        if (row === undefined) continue
        list.push({
          chatId,
          id: b.id,
          row,
          lane: n?.lane ?? run?.lane ?? 0,
          itemId: b.itemId,
          // Bei einem Lesezeichen an einem Absatz führt der Klick genau dorthin, nicht nur zum Turn.
          needle: b.block ? b.quote : undefined,
          text: einzeilig(b.label || b.quote || n?.label || 'Lesezeichen'),
          eigen: !!b.label
        })
      }
    }
    return list.sort((a, b) => a.row - b.row)
  }, [bookmarks, treeIds, transcripts, model])

  if (!model.lanes.length) return <div className="muted center-hint">Dieser Chat existiert nicht mehr.</div>
  // Rechts neben den Spuren liegen die Klammern der Gruppen – je Schachtelungstiefe eine Spalte.
  const maxDepth = Math.max(0, ...model.heads.map((h) => h.depth))
  const gutter = model.heads.length ? 12 + maxDepth * BRACKET + 6 : PAD
  const width = x(model.lanes.length - 1) + Math.max(PAD, gutter)
  const height = Math.max(1, model.nodes.length + model.runs.length) * ROW
  const firstOfLane = new Set(model.lanes.map((l) => `${l.chatId}:${l.first}`))
  const lastOfLane = new Map(model.lanes.map((l) => [l.chatId, l.last]))
  const dropTitle = dropLane ? model.lanes.find((l) => l.chatId === dropLane)?.title : undefined
  const foldedAt = new Map<number, BoardModel['collapsed']>()
  for (const f of model.collapsed) if (f.row !== undefined) foldedAt.set(f.row, [...(foldedAt.get(f.row) ?? []), f])

  return (
    <div className={`board${toc.length ? ' with-toc' : ''}`}>
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
              activeRow={activeRun?.row ?? activeNode?.row}
              activeLane={activeRun?.lane ?? activeNode?.lane}
              onLaneDragOver={laneDragOver}
              onLaneDrop={laneDrop}
              onFork={(f) => update((h) => (f.open.length ? f.open.forEach((id) => h.add(id)) : f.closed.forEach((id) => h.delete(id))))}
              onGroup={toggleGroup}
            />
            {/* Zugeklappte Gruppen */}
            {model.runs.map((r) => (
              <div
                key={r.groupId}
                role="button"
                tabIndex={0}
                className={`board-row run group${activeRun?.groupId === r.groupId ? ' active' : ''}`}
                style={{ top: r.row * ROW, height: ROW, paddingLeft: width + 6 }}
                title={`Gruppe „${r.label}“ · ${r.items.length} Nachrichten\nKlick: aufklappen`}
                onClick={() => toggleGroup(r.groupId)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleGroup(r.groupId))}
              >
                <Icon name="chevron-right" size={13} />
                <span className="board-group-name">{r.label}</span>
                <Umfang items={r.items.length} branches={r.branches} />
                <button
                  className="icon-btn board-group-drop"
                  title="Gruppe auflösen"
                  onClick={(e) => {
                    e.stopPropagation()
                    dropGroup(r.groupId)
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            {/* Markierte Strecke: benennen und gruppieren – mittig in der Strecke, nicht unter ihr:
                dort stünde sie genau auf der Zeile, die man als Nächstes anklickt. */}
            {pick && pickInfo && (
              <div className="board-pick-bar" style={{ top: pickInfo.mid * ROW + ROW / 2 }}>
                <Umfang items={pickInfo.count} branches={pickInfo.branches} />
                <input
                  autoFocus
                  value={name}
                  placeholder={defaultName}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') makeGroup()
                    else if (e.key === 'Escape') (setPick(null), setName(''))
                  }}
                />
                <button className="btn primary small-btn" onClick={makeGroup}>
                  Gruppe
                </button>
                <button className="icon-btn" title="Abbrechen (Esc)" onClick={() => (setPick(null), setName(''))}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
            {/* Kopfzeile einer offenen Gruppe */}
            {model.heads.map((h) => (
              <div
                key={h.groupId}
                role="button"
                tabIndex={0}
                className="board-row group-head"
                style={{ top: h.row * ROW, height: ROW, paddingLeft: width + 6 }}
                title={`Gruppe „${h.label}“ · ${h.items} Nachrichten\nKlick: zuklappen`}
                onClick={() => toggleGroup(h.groupId)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleGroup(h.groupId))}
              >
                <Icon name="chevron-down" size={13} />
                <span className="board-group-name">{h.label}</span>
                <Umfang items={h.items} branches={h.branches} />
                <button
                  className="icon-btn board-group-drop"
                  title="Gruppe auflösen"
                  onClick={(e) => {
                    e.stopPropagation()
                    dropGroup(h.groupId)
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            {model.nodes.map((n) => {
              const lane = model.lanes[n.lane]
              const running = busy[n.chatId] && lastOfLane.get(n.chatId) === n.row
              const first = firstOfLane.has(`${n.chatId}:${n.row}`)
              // Titel nur zeigen, wenn er mehr sagt als die Nachricht selbst (Standardtitel = Anfang der ersten Nachricht).
              const titleRepeats = sameAsTitle(lane.title, n.text)
              const open = (newCell = false): void => void useStore.getState().openFromBoard(cellId, n.chatId, n.itemId, newCell)
              const picked = pick?.chatId === n.chatId && inPick(model, pick, n)
              const click = (e: React.MouseEvent | React.KeyboardEvent): void => {
                // ⇧-Klick spannt eine Strecke auf, statt den Chat zu öffnen: erst der Anfang, dann das Ende.
                if (e.shiftKey) {
                  if (anchor && anchor.chatId === n.chatId && anchor.itemId !== n.itemId) {
                    const [from, to] = orderOf(model, n.chatId, anchor.itemId, n.itemId)
                    setPick({ chatId: n.chatId, from, to })
                    setName('')
                  } else {
                    setAnchor({ chatId: n.chatId, itemId: n.itemId })
                    setPick({ chatId: n.chatId, from: n.itemId, to: n.itemId })
                    setName('')
                  }
                  return
                }
                setAnchor({ chatId: n.chatId, itemId: n.itemId })
                setPick(null)
                open('metaKey' in e ? e.metaKey : false)
              }
              return (
                <div
                  key={`${n.chatId}:${n.itemId}`}
                  role="button"
                  tabIndex={0}
                  className={`board-row ${n.kind}${n === activeNode ? ' active' : ''}${picked ? ' picked' : ''}${n.chatId === dropLane ? ' merge-target' : ''}`}
                  style={{ top: n.row * ROW, height: ROW, paddingLeft: width + 6 }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CHAT_MIME, n.chatId)
                    e.dataTransfer.effectAllowed = 'move'
                    useStore.getState().setDragging({ chatId: n.chatId, itemId: n.itemId, fromCell: cellId })
                  }}
                  onDragEnd={() => useStore.getState().setDragging(null)}
                  onDragOver={(e) => laneDragOver(n.chatId, e)}
                  onDrop={(e) => laneDrop(n.chatId, e)}
                  onClick={click}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), click(e))}
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
                  {(() => {
                    const notes = notesOf.get(`${n.chatId}:${n.itemId}`) ?? []
                    return notes.length ? (
                      <span className="board-notes" title={notes.map((c) => c.text).join('\n\n')}>
                        <Icon name="note" size={11} />
                        {notes.length > 1 && notes.length}
                      </span>
                    ) : null
                  })()}
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
                      <Icon name="chevron-right" size={13} />
                      <span className="board-folded-title">{f.title}</span> · {f.messages}
                    </button>
                  ))}
                  {n.chatId === dropLane && lastOfLane.get(n.chatId) === n.row && (
                    <span className="board-merge-hint">⤵ hier zusammenführen{dropTitle ? ` (in „${dropTitle}“)` : ''}</span>
                  )}
                  {running && <span className="spinner" />}
                  <button
                    className="board-fork"
                    title="Hier abzweigen: Nebenchat mit dem bisherigen Verlauf, eigene Frage"
                    onClick={(e) => {
                      e.stopPropagation()
                      void useStore.getState().forkFrom(n.chatId, n.itemId, cellId)
                    }}
                  >
                    <Icon name="branch" size={13} />
                  </button>
                  <span className="board-time">{time(n.ts)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Inhaltsverzeichnis: die Lesezeichen des Diskurses, in seiner Reihenfolge */}
      {toc.length > 0 && (
        <div className={`board-toc${tocOpen ? '' : ' zu'}`} style={tocOpen ? { width: tocWidth } : undefined}>
          {tocOpen && (
            <div
              className="board-toc-resizer"
              title="Breite ziehen · Doppelklick: Standardbreite"
              onPointerDown={startResize}
              onDoubleClick={() => {
                setTocWidth(TOC_WIDTH)
                writeTocWidth(TOC_WIDTH)
              }}
            />
          )}
          <button
            className="board-toc-head"
            title={tocOpen ? 'Inhaltsverzeichnis zuklappen' : `Inhaltsverzeichnis aufklappen (${toc.length})`}
            onClick={() => (setTocOpen(!tocOpen), writeTocOpen(!tocOpen))}
          >
            <Icon name={tocOpen ? 'chevron-down' : 'chevron-right'} size={15} />
            <Icon name="bookmark" size={13} />
            {tocOpen ? <span className="board-toc-title">Lesezeichen</span> : null}
            <span className="board-toc-count">{toc.length}</span>
          </button>
          <ul hidden={!tocOpen}>
            {toc.map((b) => (
              <li key={b.id}>
                <button
                  className="board-toc-item"
                  title={`${b.text}\nKlick: an dieser Stelle öffnen · ⌘-Klick: in neuer Zelle`}
                  onClick={(e) => void useStore.getState().openFromBoard(cellId, b.chatId, b.itemId, e.metaKey, b.needle)}
                >
                  <span className="board-toc-bar" style={{ background: colorOf(model.lanes[b.lane]?.color ?? 0) }} />
                  <span className={`board-toc-text${b.eigen ? ' eigen' : ''}`}>{b.text}</span>
                </button>
                <button
                  className="icon-btn board-toc-drop"
                  title="Lesezeichen entfernen"
                  onClick={() => void useStore.getState().removeBookmark(b.chatId, b.id)}
                >
                  <Icon name="bookmark-x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Anker für ⇧-Klick je Board – außerhalb der Komponente, weil das Board beim Öffnen eines Chats neu entsteht. */
const anchors = new Map<string, { chatId: string; itemId: string }>()

// Eingeklappte Äste je Board (pro Rechner, im localStorage).
const hiddenKey = (rootId: string): string => `c2ui.boardHidden.${rootId}`
function readHidden(rootId: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(hiddenKey(rootId)) ?? '[]'))
  } catch {
    return new Set()
  }
}
/** Inhaltsverzeichnis auf/zu (pro Rechner, im localStorage – gilt für alle Boards). */
const TOC_KEY = 'c2ui.boardToc'
function readTocOpen(): boolean {
  try {
    return localStorage.getItem(TOC_KEY) !== 'zu'
  } catch {
    return true
  }
}
function writeTocOpen(open: boolean): void {
  try {
    if (open) localStorage.removeItem(TOC_KEY)
    else localStorage.setItem(TOC_KEY, 'zu')
  } catch {
    /* egal */
  }
}

// Breite des Verzeichnisses (pro Rechner, im localStorage).
const TOC_WIDTH = 210
const WIDTH_KEY = 'c2ui.boardTocWidth'
const clampTocWidth = (w: number): number => Math.round(Math.min(560, Math.max(130, w)))
function readTocWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    return v ? clampTocWidth(v) : TOC_WIDTH
  } catch {
    return TOC_WIDTH
  }
}
function writeTocWidth(w: number): void {
  try {
    if (w === TOC_WIDTH) localStorage.removeItem(WIDTH_KEY)
    else localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    /* egal */
  }
}

/** Ein Absatz als Zeile im Verzeichnis: Umbrüche und Leerraum zusammengezogen. */
function einzeilig(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function writeHidden(rootId: string, ids: Set<string>): void {
  try {
    if (ids.size) localStorage.setItem(hiddenKey(rootId), JSON.stringify([...ids]))
    else localStorage.removeItem(hiddenKey(rootId))
  } catch {
    /* egal */
  }
}

/** Umfang einer Gruppe: Nachrichten und (falls vorhanden) Äste – knapp, mit Symbolen. */
function Umfang({ items, branches }: { items: number; branches: number }) {
  return (
    <span className="board-group-size" title={`${items} ${items === 1 ? 'Nachricht' : 'Nachrichten'}${branches ? `, ${branches} ${branches === 1 ? 'Ast' : 'Äste'}` : ''}`}>
      <Icon name="messages-square" size={12} /> {items}
      {!!branches && (
        <>
          <Icon name="list-tree" size={12} /> {branches}
        </>
      )}
    </span>
  )
}

/** Reihenfolge zweier Knoten derselben Spur (Anker kann unter dem zweiten liegen). */
function orderOf(model: BoardModel, chatId: string, a: string, b: string): [string, string] {
  const ns = model.nodes.filter((n) => n.chatId === chatId)
  const ia = ns.findIndex((n) => n.itemId === a)
  const ib = ns.findIndex((n) => n.itemId === b)
  if (ia < 0 || ib < 0) return [a, b]
  return ia <= ib ? [a, b] : [b, a]
}

/** Liegt der Knoten in der markierten Strecke? */
function inPick(model: BoardModel, pick: { chatId: string; from: string; to: string }, n: BoardNode): boolean {
  const ns = model.nodes.filter((x) => x.chatId === pick.chatId)
  const from = ns.findIndex((x) => x.itemId === pick.from)
  const to = ns.findIndex((x) => x.itemId === pick.to)
  const i = ns.findIndex((x) => x.itemId === n.itemId)
  return from >= 0 && to >= 0 && i >= from && i <= to
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
  activeRow,
  activeLane,
  onFork,
  onGroup,
  onLaneDragOver,
  onLaneDrop
}: {
  model: BoardModel
  width: number
  height: number
  activeNode?: BoardNode
  /** Zeile und Spur der markierten Stelle (auch wenn sie in einer zugeklappten Gruppe steckt). */
  activeRow?: number
  activeLane?: number
  onFork: (f: Fork) => void
  onGroup: (groupId: string) => void
  onLaneDragOver: (chatId: string, e: React.DragEvent) => void
  onLaneDrop: (chatId: string, e: React.DragEvent) => void
}) {
  const forks = forksOf(model)
  return (
    <svg className="board-graph" width={width} height={height}>
      {/* Wo man im aktiven Chat gerade ist: gelber Hof um den Knoten */}
      {activeRow !== undefined && activeLane !== undefined && (
        <circle className="board-active-node" cx={x(activeLane)} cy={y(activeRow)} r={10} />
      )}
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
      {/* Offene Gruppen: Ordner an der Kopfzeile und Klammer über ihre Zeilen, in der Farbe der Spur */}
      {model.heads.map((h) => {
        const color = colorOf(model.lanes[h.lane].color)
        // Je tiefer geschachtelt, desto weiter rechts steht die Klammer.
        const bx = x(model.lanes.length - 1) + 12 + h.depth * BRACKET
        return (
          <g key={h.groupId} className="board-group" role="button" aria-label={`Gruppe ${h.label} zuklappen`} onClick={() => onGroup(h.groupId)}>
            <path
              d={`M ${bx + 4} ${y(h.row + 1) - 12} h -4 V ${y(h.lastRow) + 12} h 4`}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <Folder x={x(h.lane)} y={y(h.row)} color={color} open />
          </g>
        )
      })}
      {/* Zugeklappte Gruppen: geschlossener Ordner auf der Spur */}
      {model.runs.map((r) => {
        const cx = x(r.lane)
        const cy = y(r.row)
        const color = colorOf(model.lanes[r.lane].color)
        return (
          <g key={r.groupId} className="board-run" role="button" aria-label={`Gruppe ${r.label} aufklappen`} onClick={() => onGroup(r.groupId)}>
            <rect x={cx - 9} y={cy - 10} width={18} height={20} rx={7} className="board-run-hit" />
            <Folder x={cx} y={cy} color={color} />
            {!!r.branches && <path d={`M ${cx + 9} ${cy} h 9`} stroke={color} strokeWidth={2} strokeDasharray="3 3" />}
          </g>
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
              onDragOver={(e) => onLaneDragOver(n.chatId, e)}
              onDrop={(e) => onLaneDrop(n.chatId, e)}
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

/** Ordner auf der Spur: offen, solange die Gruppe aufgeklappt ist (Lucide „folder“/„folder-open“). */
function Folder({ x: cx, y: cy, color, open }: { x: number; y: number; color: string; open?: boolean }) {
  const d = open
    ? 'm6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'
    : 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
  return (
    <g transform={`translate(${cx - 8} ${cy - 8}) scale(0.667)`}>
      <rect x={-2} y={0} width={28} height={24} className="board-folder-bg" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
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
