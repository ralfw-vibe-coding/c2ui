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
  kind: 'message' | 'steer' | 'action'
}

export interface BoardLane {
  chatId: string
  lane: number
  title: string
  agent: Chat['agent']
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

export interface BoardModel {
  rootId: string
  lanes: BoardLane[]
  nodes: BoardNode[]
  edges: BoardEdge[]
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

export function boardModel(chats: Chat[], transcripts: Record<string, Transcript | undefined>, rootId: string): BoardModel {
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
  if (!root) return { rootId, lanes: [], nodes: [], edges: [] }

  // Spuren in Baum-Reihenfolge (vorne zuerst): Ursprung links, Nebenchats rechts davon.
  const lanes: BoardLane[] = []
  const order: Chat[] = []
  const walk = (n: ChatNode): void => {
    lanes.push({ chatId: n.chat.id, lane: lanes.length, title: n.chat.title, agent: n.chat.agent })
    order.push(n.chat)
    n.children.forEach(walk)
  }
  walk(root)
  const laneOf = new Map(lanes.map((l) => [l.chatId, l]))

  const nodes: BoardNode[] = []
  for (const c of order) {
    let k = 0
    for (const it of transcripts[c.id] ?? []) {
      if (it.type !== 'user') continue
      const kind: BoardNode['kind'] = it.steer ? 'steer' : it.text.startsWith(A2UI_ACTION_PREFIX) ? 'action' : 'message'
      nodes.push({ chatId: c.id, itemId: it.id, k: k++, ts: it.ts, lane: laneOf.get(c.id)!.lane, row: 0, label: messageLabel(it.text), text: messageLabel(it.text, 600), kind })
    }
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

  const edges: BoardEdge[] = []
  for (const c of order) {
    const p = c.forkFrom?.chatId
    const parent = p ? laneOf.get(p) : undefined
    const childFirst = byChat.get(c.id)?.[0]
    if (!parent || !childFirst) continue
    const pNodes = byChat.get(parent.chatId) ?? []
    // Abzweigstelle: Nachricht Nr. `turn` des Ursprungs; ohne Angabe die letzte vor dem Nebenchat.
    const turn = c.forkFrom?.at?.turn
    const at =
      turn !== undefined && turn > 0
        ? pNodes.find((n) => n.k === turn - 1)
        : [...pNodes].reverse().find((n) => n.row < childFirst.row)
    if (!at) continue
    edges.push({ from: { lane: parent.lane, row: at.row }, to: { lane: laneOf.get(c.id)!.lane, row: childFirst.row }, childId: c.id })
  }
  return { rootId, lanes, nodes, edges }
}
