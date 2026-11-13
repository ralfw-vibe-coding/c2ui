import type { Chat, ForkPoint } from './types'

/**
 * Wo im Verlauf des Ursprungs die Markierungen seiner Nebenchats stehen.
 * @param units Darstellungseinheiten des Ursprungs in Reihenfolge: zugehöriger Transkript-Eintrag und
 *   ob es eine Nutzernachricht ist
 * @param children Nebenchats mit Abzweigpunkt
 * @returns Index der Einheit, nach der die Markierung steht → Nebenchats dort (in Reihenfolge)
 *
 * Mit `itemId`: nach der letzten Einheit dieses Eintrags (die Antwort, aus der zitiert wurde).
 * Sonst nach `turn` Turns, d. h. vor der nächsten Nutzernachricht. Ohne Abzweigpunkt keine Markierung.
 */
export function forkAnchors(
  units: { itemId: string; isUser: boolean }[],
  children: { id: string; at?: ForkPoint }[]
): Map<number, string[]> {
  const lastOf = new Map<string, number>()
  const userIdx: number[] = []
  units.forEach((u, i) => {
    lastOf.set(u.itemId, i)
    if (u.isUser) userIdx.push(i)
  })
  const out = new Map<number, string[]>()
  for (const c of children) {
    const at = c.at
    if (!at || units.length === 0) continue
    let idx = at.itemId !== undefined ? lastOf.get(at.itemId) : undefined
    if (idx === undefined) idx = at.turn < userIdx.length ? userIdx[at.turn] - 1 : units.length - 1
    if (idx < 0) continue
    const list = out.get(idx) ?? []
    list.push(c.id)
    out.set(idx, list)
  }
  return out
}

/** Glied der Kette von der Wurzel bis zum direkten Ursprung eines Nebenchats. */
export interface ForkLink {
  /** Chat dieses Glieds; fehlt, wenn er gelöscht ist. */
  chatId?: string
  title: string
  /** Nebenchat auf dem Weg nach unten (dessen Abzweigpunkt in diesem Glied liegt). */
  childId: string
}

/** Vorfahren eines Chats, von der Wurzel bis zum direkten Ursprung (leer, wenn kein Nebenchat). */
export function forkChain(chats: Chat[], chatId: string): ForkLink[] {
  const byId = new Map(chats.map((c) => [c.id, c]))
  const chain: ForkLink[] = []
  const seen = new Set<string>([chatId])
  let child = byId.get(chatId)
  while (child?.forkFrom) {
    const pid = child.forkFrom.chatId
    const parent = byId.get(pid)
    chain.unshift({ chatId: parent?.id, title: parent?.title ?? child.forkFrom.title, childId: child.id })
    if (!parent || seen.has(pid)) break
    seen.add(pid)
    child = parent
  }
  return chain
}
