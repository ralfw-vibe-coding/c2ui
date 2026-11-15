import { A2UI_ACTION_PREFIX } from './a2ui'
import { chatTree, type ChatNode } from './chatTree'
import type { BoardGroup, Chat, Transcript } from './types'

/**
 * Diskursboard (Schritt 3): Graph wie `git log --graph`. Zeit läuft nach unten, jeder Chat eines
 * Baums ist eine Spur, jede Nutzernachricht ein Knoten; Abzweigungen verbinden die Abzweigstelle im
 * Ursprung mit dem ersten Knoten des Nebenchats.
 */

export interface BoardNode {
  chatId: string
  /** Transkript-Eintrag der Nutzernachricht (Sprungziel). */
  itemId: string
  /** Position unter den Nutzernachrichten des Chats (0-basiert). */
  k: number
  ts: number
  lane: number
  row: number
  label: string
  /** Eigener Text der Nachricht (ohne Zitatzeilen), ungekürzt bis 600 Zeichen – für den Tooltip. */
  text: string
  kind: 'message' | 'steer' | 'action' | 'prepare' | 'merge'
}

export interface BoardLane {
  chatId: string
  lane: number
  title: string
  agent: Chat['agent']
  /** Feste Farbe: Position im ganzen Baum (ändert sich nicht, wenn Äste eingeklappt werden). */
  color: number
  /** Erste und letzte Zeile der Spur (fehlt, solange der Chat keine Nachricht hat). */
  first?: number
  last?: number
}

export interface BoardEdge {
  /** Abzweigstelle im Ursprung. */
  from: { lane: number; row: number }
  /** Erster Knoten des Nebenchats. */
  to: { lane: number; row: number }
  childId: string
}

/** Zusammenführung: vom Stand im Nebenchat (Aufarbeitung bzw. übernommene Nachricht) zur Übernahme im Ziel. */
export interface BoardMerge {
  from: { lane: number; row: number }
  to: { lane: number; row: number }
  /** Nebenchat, aus dem übernommen wurde (für die Farbe). */
  sourceId: string
  /** Übernahme-Nachricht im Ziel. */
  itemId: string
}

/** Eingeklappter Ast: an der Abzweigstelle im Ursprung steht ein Chip zum Aufklappen. */
export interface BoardCollapsed {
  chatId: string
  title: string
  /** Spur und Zeile der Abzweigstelle im Ursprung (Zeile fehlt, wenn sie nicht bestimmbar ist). */
  lane: number
  row?: number
  color: number
  /** Verborgene Nachrichten bzw. Chats (Ast samt Unterästen). */
  messages: number
  chats: number
}

/**
 * Zusammengefasste Strecke: aufeinanderfolgende gewöhnliche Nachrichten derselben Spur, zwischen
 * denen nichts Bemerkenswertes passiert. Sie stehen als eine Zeile da und lassen sich aufklappen.
 */
/** Zugeklappte Gruppe: eine Zeile statt ihrer Knoten. */
export interface BoardRun {
  groupId: string
  label: string
  chatId: string
  lane: number
  row: number
  /** Verborgene Knoten, in Reihenfolge. */
  items: BoardNode[]
  /** Äste, die in der Gruppe stecken und mit eingeklappt sind. */
  branches: number
}

/** Kopfzeile einer aufgeklappten Gruppe; die Klammer reicht von `row` + 1 bis `lastRow`. */
export interface BoardGroupHead {
  groupId: string
  label: string
  chatId: string
  lane: number
  row: number
  lastRow: number
  items: number
  branches: number
}

export interface BoardModel {
  rootId: string
  lanes: BoardLane[]
  nodes: BoardNode[]
  edges: BoardEdge[]
  merges: BoardMerge[]
  collapsed: BoardCollapsed[]
  /** Eingeklappte Strecken (in `nodes` fehlen deren Knoten). */
  runs: BoardRun[]
  /** Aufgeklappte Gruppen: Kopfzeile und Umfang der Klammer. */
  heads: BoardGroupHead[]
}

export interface BoardOptions {
  /** Eingeklappte Äste: Chat-IDs, deren Spur samt Unterästen nicht gezeigt wird. */
  hidden?: ReadonlySet<string>
  /** Selbst angelegte Gruppen dieses Baums. */
  groups?: readonly BoardGroup[]
}

/** Wurzel des Baums, zu dem ein Chat gehört. */
export function rootOf(chats: Chat[], chatId: string): string {
  const byId = new Map(chats.map((c) => [c.id, c]))
  const seen = new Set<string>()
  let id = chatId
  while (!seen.has(id)) {
    seen.add(id)
    const p = byId.get(id)?.forkFrom?.chatId
    if (!p || !byId.has(p)) break
    id = p
  }
  return id
}

/** Sagt der Chat-Titel nur dasselbe wie die Nachricht (Standardtitel = Anfang der ersten Nachricht)? */
export function sameAsTitle(title: string, text: string): boolean {
  const norm = (s: string): string => s.replace(/…$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const t = norm(title)
  return !!t && norm(text).startsWith(t)
}

/** Kurztext einer Nutzernachricht: ohne Zitatzeilen, erste Zeile, gekürzt. */
export function messageLabel(text: string, max = 90): string {
  if (text.startsWith(A2UI_ACTION_PREFIX)) {
    try {
      const a = JSON.parse(text.slice(A2UI_ACTION_PREFIX.length))
      return `Aktion „${a.name ?? '?'}“`
    } catch {
      return 'Aktion'
    }
  }
  const lines = text.split('\n').map((l) => l.trim())
  const own = lines.filter((l) => l && !l.startsWith('>'))
  const quote = lines.filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, ''))
  const first = own[0] ?? (quote.length ? `„${quote.join(' ')}“` : '')
  const s = first.replace(/\s+/g, ' ')
  return s.length > max ? s.slice(0, max - 1) + '…' : s || '(ohne Text)'
}

export function boardModel(
  chats: Chat[],
  transcripts: Record<string, Transcript | undefined>,
  rootId: string,
  opts: BoardOptions | ReadonlySet<string> = {}
): BoardModel {
  // Früher war der vierte Platz die Menge der eingeklappten Äste; das bleibt gültig.
  const o: BoardOptions = opts instanceof Set ? { hidden: opts } : (opts as BoardOptions)
  const hidden = o.hidden ?? new Set<string>()
  const groups = o.groups ?? []
  const tree = chatTree(chats)
  const find = (ns: ChatNode[]): ChatNode | undefined => {
    for (const n of ns) {
      if (n.chat.id === rootId) return n
      const f = find(n.children)
      if (f) return f
    }
    return undefined
  }
  const root = find(tree)
  if (!root) return { rootId, lanes: [], nodes: [], edges: [], merges: [], collapsed: [], runs: [], heads: [] }

  const userItems = (chatId: string) => (transcripts[chatId] ?? []).filter((it): it is Extract<Transcript[number], { type: 'user' }> => it.type === 'user')

  /**
   * Gruppen auf Nachrichtenbereiche abbilden. Äste, die innerhalb einer Strecke abzweigen, gehören
   * dazu: Ist die Gruppe zu, verschwinden sie mit – samt ihrer Unteräste.
   */
  const byId = new Map(chats.map((c) => [c.id, c]))
  const kidsOf = new Map<string, Chat[]>()
  for (const c of chats) if (c.forkFrom?.chatId) kidsOf.set(c.forkFrom.chatId, [...(kidsOf.get(c.forkFrom.chatId) ?? []), c])
  /** Nachricht Nr. k im Ursprung, an der ein Ast abzweigt (wie `forkNode`, aber ohne Knoten). */
  const forkK = (c: Chat): number => {
    const turn = c.forkFrom?.at?.turn
    if (turn !== undefined && turn > 0) return turn - 1
    const first = userItems(c.id)[0]?.ts
    const parent = userItems(c.forkFrom?.chatId ?? '')
    if (first === undefined) return -1
    for (let i = parent.length - 1; i >= 0; i--) if (parent[i].ts <= first) return i
    return -1
  }
  const withKids = (id: string, into: Set<string>): void => {
    for (const k of kidsOf.get(id) ?? []) {
      if (into.has(k.id)) continue
      into.add(k.id)
      withKids(k.id, into)
    }
  }
  interface Resolved {
    group: BoardGroup
    items: string[]
    branches: Set<string>
  }
  const resolved: Resolved[] = []
  for (const g of groups) {
    if (!byId.has(g.chatId)) continue
    const items = userItems(g.chatId)
    const from = items.findIndex((i) => i.id === g.fromItemId)
    const to = items.findIndex((i) => i.id === g.toItemId)
    if (from < 0 || to < 0 || to < from) continue
    const branches = new Set<string>()
    for (const k of kidsOf.get(g.chatId) ?? []) {
      const at = forkK(k)
      if (at >= from && at <= to) {
        branches.add(k.id)
        withKids(k.id, branches)
      }
    }
    resolved.push({ group: g, items: items.slice(from, to + 1).map((i) => i.id), branches })
  }
  // Was in einer zugeklappten Gruppe steckt, bekommt keine Spur – und auch keinen eigenen Chip.
  const inClosedGroup = new Set<string>()
  for (const r of resolved) if (r.group.closed) for (const id of r.branches) inClosedGroup.add(id)
  const hiddenAll = new Set([...hidden, ...inClosedGroup])

  // Spuren in Baum-Reihenfolge (vorne zuerst): Ursprung links, Nebenchats rechts davon.
  // Eingeklappte Äste (nie die Wurzel) bekommen keine Spur; ihr Teilbaum wird mitgezählt.
  const lanes: BoardLane[] = []
  const order: Chat[] = []
  const folded: { node: ChatNode; parent: Chat; color: number }[] = []
  const colorOf = new Map<string, number>()
  const number = (n: ChatNode): void => {
    colorOf.set(n.chat.id, colorOf.size)
    n.children.forEach(number)
  }
  number(root)
  const walk = (n: ChatNode, parent?: Chat): void => {
    if (parent && hiddenAll.has(n.chat.id)) {
      // In einer Gruppe steckende Äste bekommen keinen Chip – die Gruppe sagt schon, dass da welche sind.
      if (!inClosedGroup.has(n.chat.id)) folded.push({ node: n, parent, color: colorOf.get(n.chat.id)! })
      return
    }
    lanes.push({ chatId: n.chat.id, lane: lanes.length, title: n.chat.title, agent: n.chat.agent, color: colorOf.get(n.chat.id)! })
    order.push(n.chat)
    n.children.forEach((k) => walk(k, n.chat))
  }
  walk(root)
  const laneOf = new Map(lanes.map((l) => [l.chatId, l]))

  const nodes: BoardNode[] = []
  for (const c of order) {
    userItems(c.id).forEach((it, k) => {
      const kind: BoardNode['kind'] =
        it.merge?.role === 'adopt'
          ? 'merge'
          : it.merge?.role === 'prepare'
            ? 'prepare'
            : it.steer
              ? 'steer'
              : it.text.startsWith(A2UI_ACTION_PREFIX)
                ? 'action'
                : 'message'
      const label =
        it.merge?.role === 'adopt'
          ? `Übernommen aus „${it.merge.fromTitle}“`
          : it.merge?.role === 'prepare'
            ? `Aufarbeitung für „${it.merge.targetTitle}“`
            : messageLabel(it.text)
      nodes.push({ chatId: c.id, itemId: it.id, k, ts: it.ts, lane: laneOf.get(c.id)!.lane, row: 0, label, text: messageLabel(it.text, 600), kind })
    })
  }
  nodes.sort((a, b) => a.ts - b.ts || a.lane - b.lane || a.k - b.k)

  const allOfChat = new Map<string, BoardNode[]>()
  for (const n of nodes) allOfChat.set(n.chatId, [...(allOfChat.get(n.chatId) ?? []), n])

  /** Abzweigstelle im Ursprung: Nachricht Nr. `turn`; ohne Angabe die letzte vor dem ersten Knoten des Asts. */
  const forkNode = (c: Chat, parentId: string, firstTs: number | undefined): BoardNode | undefined => {
    const pNodes = allOfChat.get(parentId) ?? []
    const turn = c.forkFrom?.at?.turn
    if (turn !== undefined && turn > 0) return pNodes.find((n) => n.k === turn - 1)
    return firstTs === undefined ? undefined : [...pNodes].reverse().find((n) => n.ts <= firstTs)
  }

  const anchors = new Map<string, BoardNode | undefined>()
  for (const c of [...order, ...folded.map((f) => f.node.chat)]) {
    const p = c.forkFrom?.chatId
    if (!p) continue
    const at = forkNode(c, p, allOfChat.get(c.id)?.[0]?.ts ?? userItems(c.id)[0]?.ts)
    anchors.set(c.id, at)
  }
  const mergePairs: { from: BoardNode; to: BoardNode; sourceId: string; itemId: string }[] = []
  for (const c of order) {
    for (const it of userItems(c.id)) {
      const m = it.merge
      if (m?.role !== 'adopt') continue
      const to = allOfChat.get(c.id)?.find((n) => n.itemId === it.id)
      const src = allOfChat.get(m.fromChatId)
      if (!to || !src?.length) continue
      const from = (m.fromItemId && src.find((n) => n.itemId === m.fromItemId)) || [...src].reverse().find((n) => n.ts <= it.ts)
      if (!from) continue
      mergePairs.push({ from, to, sourceId: m.fromChatId, itemId: it.id })
    }
  }

  const groupOf = new Map<BoardNode, Resolved>()
  for (const r of resolved) {
    const items = new Set(r.items)
    for (const n of nodes) if (n.chatId === r.group.chatId && items.has(n.itemId)) groupOf.set(n, r)
  }

  // Zeilen vergeben: jeder Knoten eine, jede Gruppe eine (zugeklappt statt ihrer Knoten,
  // offen als Kopfzeile darüber).
  const shown: BoardNode[] = []
  const runs: BoardRun[] = []
  const heads: BoardGroupHead[] = []
  const rowOrder: (BoardNode | BoardRun | BoardGroupHead)[] = []
  const headOf = new Map<string, BoardGroupHead>()
  // Knoten je Gruppe (nicht unbedingt am Stück: dazwischen können Knoten anderer Spuren liegen).
  const nodesOfGroup = new Map<string, BoardNode[]>()
  for (const [n, r] of groupOf) nodesOfGroup.set(r.group.id, [...(nodesOfGroup.get(r.group.id) ?? []), n])
  const started = new Set<string>()
  for (let i = 0; i < nodes.length; ) {
    const n = nodes[i]
    const r = groupOf.get(n)
    if (r) {
      // Die Zeile der Gruppe entsteht beim ersten ihrer Knoten – auch wenn die Knoten nicht
      // lückenlos untereinander stehen, weil dazwischen ein Ast etwas gesagt hat.
      const first = !started.has(r.group.id)
      started.add(r.group.id)
      if (r.group.closed) {
        if (first) {
          const run: BoardRun = {
            groupId: r.group.id,
            label: r.group.label,
            chatId: r.group.chatId,
            lane: n.lane,
            row: 0,
            items: nodesOfGroup.get(r.group.id) ?? [],
            branches: r.branches.size
          }
          runs.push(run)
          rowOrder.push(run)
        }
      } else {
        if (first) {
          const head: BoardGroupHead = {
            groupId: r.group.id,
            label: r.group.label,
            chatId: r.group.chatId,
            lane: n.lane,
            row: 0,
            lastRow: 0,
            items: (nodesOfGroup.get(r.group.id) ?? []).length,
            branches: r.branches.size
          }
          heads.push(head)
          headOf.set(r.group.id, head)
          rowOrder.push(head)
        }
        shown.push(n)
        rowOrder.push(n)
      }
      i++
      continue
    }
    shown.push(n)
    rowOrder.push(n)
    i++
  }
  rowOrder.forEach((r, i) => (r.row = i))
  // Die Klammer reicht bis zum letzten Knoten der Gruppe.
  for (const h of heads) {
    const last = [...rowOrder].reverse().find((r) => 'itemId' in r && groupOf.get(r as BoardNode)?.group.id === h.groupId)
    h.lastRow = last ? last.row : h.row
  }
  nodes.length = 0
  nodes.push(...shown)

  const byChat = new Map<string, BoardNode[]>()
  for (const n of nodes) byChat.set(n.chatId, [...(byChat.get(n.chatId) ?? []), n])
  for (const l of lanes) {
    const ns = byChat.get(l.chatId)
    if (ns?.length) {
      l.first = ns[0].row
      l.last = ns[ns.length - 1].row
    }
  }

  const edges: BoardEdge[] = []
  for (const c of order) {
    const p = c.forkFrom?.chatId
    const parent = p ? laneOf.get(p) : undefined
    const childFirst = byChat.get(c.id)?.[0]
    const at = anchors.get(c.id)
    if (!parent || !childFirst || !at) continue
    edges.push({ from: { lane: parent.lane, row: at.row }, to: { lane: laneOf.get(c.id)!.lane, row: childFirst.row }, childId: c.id })
  }

  // Zusammenführungen: aus dem Stand im Nebenchat (fehlt er, dessen letzter Knoten davor) zur Übernahme.
  const merges: BoardMerge[] = mergePairs.map((m) => ({
    from: { lane: m.from.lane, row: m.from.row },
    to: { lane: m.to.lane, row: m.to.row },
    sourceId: m.sourceId,
    itemId: m.itemId
  }))

  const collapsed: BoardCollapsed[] = []
  for (const { node, parent, color } of folded) {
    const all: Chat[] = []
    const collect = (n: ChatNode): void => {
      all.push(n.chat)
      n.children.forEach(collect)
    }
    collect(node)
    const at = anchors.get(node.chat.id)
    collapsed.push({
      chatId: node.chat.id,
      title: node.chat.title,
      lane: laneOf.get(parent.id)!.lane,
      row: at?.row,
      color,
      messages: all.reduce((n, c) => n + userItems(c.id).length, 0),
      chats: all.length
    })
  }
  return { rootId, lanes, nodes, edges, merges, collapsed, runs, heads }
}

/**
 * Zu welchem Knoten gehört ein Transkript-Eintrag? Knoten sind nur die Nutzernachrichten; die
 * Antwort darauf (und alles bis zur nächsten Frage) gehört zum selben Knoten. Damit landen auch
 * Notizen zu einer Antwort am richtigen Knoten. Einträge vor der ersten Frage zählen zu dieser.
 */
export function nodeOfItem(transcript: Transcript): Map<string, string> {
  const first = transcript.find((it) => it.type === 'user')?.id
  const map = new Map<string, string>()
  if (!first) return map
  let current = first
  for (const it of transcript) {
    if (it.type === 'user') current = it.id
    map.set(it.id, current)
  }
  return map
}
