import { A2UI_ACTION_PREFIX } from './a2ui'
import { chatTree, type ChatNode } from './chatTree'
import type { Chat, Transcript } from './types'

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

export interface BoardModel {
  rootId: string
  lanes: BoardLane[]
  nodes: BoardNode[]
  edges: BoardEdge[]
  merges: BoardMerge[]
  collapsed: BoardCollapsed[]
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
  /** Eingeklappte Äste: Chat-IDs, deren Spur samt Unterästen nicht gezeigt wird. */
  hidden: ReadonlySet<string> = new Set()
): BoardModel {
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
  if (!root) return { rootId, lanes: [], nodes: [], edges: [], merges: [], collapsed: [] }

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
    if (parent && hidden.has(n.chat.id)) {
      folded.push({ node: n, parent, color: colorOf.get(n.chat.id)! })
      return
    }
    lanes.push({ chatId: n.chat.id, lane: lanes.length, title: n.chat.title, agent: n.chat.agent, color: colorOf.get(n.chat.id)! })
    order.push(n.chat)
    n.children.forEach((k) => walk(k, n.chat))
  }
  walk(root)
  const laneOf = new Map(lanes.map((l) => [l.chatId, l]))

  const userItems = (chatId: string) => (transcripts[chatId] ?? []).filter((it): it is Extract<Transcript[number], { type: 'user' }> => it.type === 'user')
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
  nodes.forEach((n, i) => (n.row = i))

  const byChat = new Map<string, BoardNode[]>()
  for (const n of nodes) byChat.set(n.chatId, [...(byChat.get(n.chatId) ?? []), n])
  for (const l of lanes) {
    const ns = byChat.get(l.chatId)
    if (ns?.length) {
      l.first = ns[0].row
      l.last = ns[ns.length - 1].row
    }
  }

  /** Abzweigstelle im Ursprung: Nachricht Nr. `turn`; ohne Angabe die letzte vor dem ersten Knoten des Asts. */
  const forkNode = (c: Chat, parentId: string, firstTs: number | undefined): BoardNode | undefined => {
    const pNodes = byChat.get(parentId) ?? []
    const turn = c.forkFrom?.at?.turn
    if (turn !== undefined && turn > 0) return pNodes.find((n) => n.k === turn - 1)
    return firstTs === undefined ? undefined : [...pNodes].reverse().find((n) => n.ts <= firstTs)
  }

  const edges: BoardEdge[] = []
  for (const c of order) {
    const p = c.forkFrom?.chatId
    const parent = p ? laneOf.get(p) : undefined
    const childFirst = byChat.get(c.id)?.[0]
    if (!parent || !childFirst) continue
    const at = forkNode(c, parent.chatId, childFirst.ts)
    if (!at) continue
    edges.push({ from: { lane: parent.lane, row: at.row }, to: { lane: laneOf.get(c.id)!.lane, row: childFirst.row }, childId: c.id })
  }

  // Zusammenführungen: aus dem Stand im Nebenchat (fehlt er, dessen letzter Knoten davor) zur Übernahme.
  const merges: BoardMerge[] = []
  for (const c of order) {
    for (const it of userItems(c.id)) {
      const m = it.merge
      if (m?.role !== 'adopt') continue
      const to = byChat.get(c.id)?.find((n) => n.itemId === it.id)
      const src = byChat.get(m.fromChatId)
      if (!to || !src?.length) continue
      const from = (m.fromItemId && src.find((n) => n.itemId === m.fromItemId)) || [...src].reverse().find((n) => n.ts <= it.ts)
      if (!from) continue
      merges.push({ from: { lane: from.lane, row: from.row }, to: { lane: to.lane, row: to.row }, sourceId: m.fromChatId, itemId: it.id })
    }
  }

  const collapsed: BoardCollapsed[] = []
  for (const { node, parent, color } of folded) {
    const all: Chat[] = []
    const collect = (n: ChatNode): void => {
      all.push(n.chat)
      n.children.forEach(collect)
    }
    collect(node)
    const at = forkNode(node.chat, parent.id, userItems(node.chat.id)[0]?.ts)
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
  return { rootId, lanes, nodes, edges, merges, collapsed }
}
