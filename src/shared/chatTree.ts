import type { Chat } from './types'

/** Knoten im Chat-Baum: ein Chat mit seinen Nebenchats (abgezweigt per „in neuem Chat fragen“). */
export interface ChatNode {
  chat: Chat
  children: ChatNode[]
  /** Letzte Aktivität im ganzen Teilbaum (für die Reihenfolge der Wurzeln). */
  latest: number
  /** Jüngstes Anheften im Teilbaum (0 = nichts angeheftet). */
  pinned: number
  /** Anzahl aller Nachfahren. */
  descendants: number
}

/**
 * Baut aus der flachen Chatliste einen Baum. Wurzeln sind Chats ohne Ursprung oder deren Ursprung
 * gelöscht ist; sie stehen nach letzter Aktivität im Teilbaum (ein Diskurs rückt nach oben, wenn
 * irgendwo in ihm gearbeitet wird). Nebenchats stehen in der Reihenfolge ihres Abzweigens.
 * Angeheftete Chats ziehen ihren Baum nach oben – ein Nebenchat bleibt dabei an seinem Platz
 * im Baum, damit die Herkunft sichtbar bleibt.
 */
export function chatTree(chats: Chat[]): ChatNode[] {
  const byId = new Map(chats.map((c) => [c.id, c]))
  const kids = new Map<string, Chat[]>()
  const roots: Chat[] = []
  for (const c of chats) {
    const parent = c.forkFrom?.chatId
    if (parent && parent !== c.id && byId.has(parent) && !createsCycle(c, byId)) {
      const list = kids.get(parent) ?? []
      list.push(c)
      kids.set(parent, list)
    } else roots.push(c)
  }
  const build = (c: Chat): ChatNode => {
    const children = (kids.get(c.id) ?? []).sort((a, b) => a.createdAt - b.createdAt).map(build)
    return {
      chat: c,
      children,
      latest: Math.max(c.updatedAt, ...children.map((n) => n.latest)),
      pinned: Math.max(c.pinned ?? 0, ...children.map((n) => n.pinned)),
      descendants: children.reduce((n, k) => n + 1 + k.descendants, 0)
    }
  }
  // Angeheftetes steht oben (zuletzt angeheftet zuerst), darunter nach letzter Aktivität.
  return roots.map(build).sort((a, b) => b.pinned - a.pinned || b.latest - a.latest)
}

/** Schutz gegen kaputte Daten: führt die Ursprungskette zurück zum Chat selbst? */
function createsCycle(c: Chat, byId: Map<string, Chat>): boolean {
  const seen = new Set<string>([c.id])
  let p = c.forkFrom?.chatId
  while (p) {
    if (seen.has(p)) return true
    seen.add(p)
    p = byId.get(p)?.forkFrom?.chatId
  }
  return false
}

/** Sichtbare Zeilen des Baums (zugeklappte Teilbäume ausgelassen, Angeheftetes bleibt), mit Tiefe. */
export function visibleRows(nodes: ChatNode[], collapsed: Set<string>, depth = 0): { node: ChatNode; depth: number }[] {
  return nodes.flatMap((n) => [
    { node: n, depth },
    ...(collapsed.has(n.chat.id) ? pinnedRows(n.children, depth + 1) : visibleRows(n.children, collapsed, depth + 1))
  ])
}

/** Angeheftetes bleibt sichtbar, auch wenn sein Ursprung zugeklappt ist – sonst nützt das Anheften nichts. */
function pinnedRows(nodes: ChatNode[], depth: number): { node: ChatNode; depth: number }[] {
  return nodes.flatMap((n) => [...(n.chat.pinned ? [{ node: n, depth }] : []), ...pinnedRows(n.children, depth + 1)])
}
