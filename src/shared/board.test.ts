import { describe, expect, it } from 'vitest'
import { boardModel, messageLabel, nodeOfItem, rootOf, sameAsTitle } from './board'
import { A2UI_ACTION_PREFIX } from './a2ui'
import type { BoardGroup, Chat, Transcript } from './types'

const chat = (id: string, created: number, parent?: string, turn?: number): Chat =>
  ({
    id,
    title: `T-${id}`,
    agent: 'claude',
    createdAt: created,
    updatedAt: created,
    ...(parent ? { forkFrom: { chatId: parent, title: parent, ...(turn !== undefined ? { at: { turn } } : {}) } } : {})
  }) as Chat

const user = (id: string, ts: number, text = id, extra = {}) => ({ type: 'user' as const, id, ts, text, ...extra })
const answer = (id: string) => ({ type: 'assistant' as const, id, blocks: [] })

describe('Diskursboard', () => {
  const chats = [chat('r', 1), chat('a', 30, 'r', 2), chat('b', 50, 'a', 1), chat('c', 60, 'r', 3)]
  const transcripts: Record<string, Transcript> = {
    r: [user('r1', 10), answer('x'), user('r2', 20), answer('y'), user('r3', 40), answer('z')],
    a: [{ type: 'notice', id: 'n', text: 'Abgezweigt' }, user('a1', 35), user('a2', 55, 'Zwischen', { steer: true })],
    b: [user('b1', 52)],
    c: [user('c1', 70)]
  }

  it('legt Spuren in Baum-Reihenfolge und Zeilen nach Zeit an', () => {
    const m = boardModel(chats, transcripts, 'r')
    expect(m.lanes.map((l) => l.chatId)).toEqual(['r', 'a', 'b', 'c'])
    expect(m.nodes.map((n) => `${n.chatId}:${n.itemId}@${n.row}`)).toEqual([
      'r:r1@0',
      'r:r2@1',
      'a:a1@2',
      'r:r3@3',
      'b:b1@4',
      'a:a2@5',
      'c:c1@6'
    ])
    expect(m.nodes.find((n) => n.itemId === 'a2')?.kind).toBe('steer')
    expect(m.lanes.find((l) => l.chatId === 'a')).toMatchObject({ first: 2, last: 5 })
  })

  it('verbindet die Abzweigstelle mit dem ersten Knoten des Nebenchats', () => {
    const m = boardModel(chats, transcripts, 'r')
    expect(m.edges).toEqual([
      { from: { lane: 0, row: 1 }, to: { lane: 1, row: 2 }, childId: 'a' },
      { from: { lane: 1, row: 2 }, to: { lane: 2, row: 4 }, childId: 'b' },
      { from: { lane: 0, row: 3 }, to: { lane: 3, row: 6 }, childId: 'c' }
    ])
  })

  it('nimmt ohne Abzweigpunkt die letzte Nachricht davor; Nebenchat ohne Nachricht hat keine Kante', () => {
    const m = boardModel([chat('r', 1), chat('a', 30, 'r'), chat('e', 80, 'r', 1)], { r: transcripts.r, a: transcripts.a, e: [] }, 'r')
    expect(m.edges).toEqual([{ from: { lane: 0, row: 1 }, to: { lane: 1, row: 2 }, childId: 'a' }])
    expect(m.lanes.find((l) => l.chatId === 'e')?.first).toBeUndefined()
  })

  it('klappt Äste samt Unterästen ein und vermerkt sie an der Abzweigstelle', () => {
    const m = boardModel(chats, transcripts, 'r', new Set(['a']))
    expect(m.lanes.map((l) => l.chatId)).toEqual(['r', 'c'])
    expect(m.nodes.map((n) => n.itemId)).toEqual(['r1', 'r2', 'r3', 'c1'])
    expect(m.edges).toEqual([{ from: { lane: 0, row: 2 }, to: { lane: 1, row: 3 }, childId: 'c' }])
    expect(m.collapsed).toEqual([{ chatId: 'a', title: 'T-a', lane: 0, row: 1, color: 1, messages: 3, chats: 2 }])
    // Farben bleiben fest: c behält die Farbe 3, obwohl es jetzt Spur 1 ist
    expect(m.lanes.map((l) => l.color)).toEqual([0, 3])
    // Die Wurzel lässt sich nicht einklappen
    expect(boardModel(chats, transcripts, 'r', new Set(['r'])).lanes.length).toBe(4)
  })

  it('zeigt Zusammenführungen als Kante vom Nebenchat zur Übernahme', () => {
    const t: Record<string, Transcript> = {
      ...transcripts,
      a: [...transcripts.a, user('a3', 57, 'Fasse zusammen', { merge: { role: 'prepare', targetId: 'r', targetTitle: 'T-r' } })],
      r: [...transcripts.r, user('r4', 58, 'Nimm auf', { merge: { role: 'adopt', fromChatId: 'a', fromItemId: 'a3', fromTitle: 'T-a' } })]
    }
    const m = boardModel(chats, t, 'r')
    const from = m.nodes.find((n) => n.itemId === 'a3')!
    const to = m.nodes.find((n) => n.itemId === 'r4')!
    expect(from.kind).toBe('prepare')
    expect(to.kind).toBe('merge')
    expect(to.label).toBe('Übernommen aus „T-a“')
    expect(m.merges).toEqual([{ from: { lane: 1, row: from.row }, to: { lane: 0, row: to.row }, sourceId: 'a', itemId: 'r4' }])
    // Eingeklappter Nebenchat: keine Kante
    expect(boardModel(chats, t, 'r', new Set(['a'])).merges).toEqual([])
  })

  it('findet die Wurzel eines Chats', () => {
    expect(rootOf(chats, 'b')).toBe('r')
    expect(rootOf(chats, 'r')).toBe('r')
  })

  it('erkennt Titel, die nur die Nachricht wiederholen', () => {
    expect(sameAsTitle('erkläre mir die gewaltenteilun…', 'Erkläre mir die Gewaltenteilung.')).toBe(true)
    expect(sameAsTitle('Quellenlage', 'Welche Quellen gibt es?')).toBe(false)
  })

  it('beschriftet Nachrichten knapp', () => {
    expect(messageLabel('> Zitat\n\nWas heißt das?')).toBe('Was heißt das?')
    expect(messageLabel('> nur ein Zitat')).toBe('„nur ein Zitat“')
    expect(messageLabel(A2UI_ACTION_PREFIX + JSON.stringify({ name: 'absenden' }))).toBe('Aktion „absenden“')
    expect(messageLabel('x'.repeat(200)).length).toBe(90)
  })
  it('ordnet jeden Eintrag dem Knoten seines Turns zu', () => {
    const t: Transcript = [
      { type: 'notice', id: 'n0', text: 'Abgezweigt' },
      { type: 'user', id: 'u1', ts: 1, text: 'Frage?' },
      { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Antwort.' }] },
      { type: 'turn', id: 't1', durationMs: 1, isError: false },
      { type: 'user', id: 'u2', ts: 2, text: 'Und weiter?' },
      { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: 'Mehr.' }] }
    ] as unknown as Transcript
    const m = nodeOfItem(t)
    expect([...m.entries()]).toEqual([['n0', 'u1'], ['u1', 'u1'], ['a1', 'u1'], ['t1', 'u1'], ['u2', 'u2'], ['a2', 'u2']])
    expect(nodeOfItem([])).toEqual(new Map())
  })
  it('fasst von sich aus nichts zusammen – das macht nur, wer gruppiert', () => {
    const lang: Record<string, Transcript> = {
      r: Array.from({ length: 30 }, (_, i) => user(`r${i + 1}`, 10 + i)) as unknown as Transcript
    }
    const m = boardModel([chat('r', 1)], lang, 'r')
    expect(m.runs).toEqual([])
    expect(m.heads).toEqual([])
    expect(m.nodes).toHaveLength(30)
    expect(m.nodes.map((n) => n.row)).toEqual([...Array(30).keys()])
  })

  describe('eigene Gruppen', () => {
    // Wurzel mit zehn Nachrichten; nach der vierten zweigt ein Ast ab, der selbst einen Unterast hat.
    const t: Record<string, Transcript> = {
      r: Array.from({ length: 10 }, (_, i) => user(`r${i + 1}`, 10 + i)) as unknown as Transcript,
      a: [user('a1', 100)] as unknown as Transcript,
      a2: [user('a21', 110)] as unknown as Transcript
    }
    const cs = [chat('r', 1), chat('a', 90, 'r', 4), chat('a2', 95, 'a', 1)]
    const gruppe = (over: Partial<BoardGroup> = {}): BoardGroup => ({
      id: 'g1', chatId: 'r', fromItemId: 'r3', toItemId: 'r6', label: 'Bildbeschaffung', closed: true, createdAt: 1, ...over
    })

    it('klappt die Strecke samt der Äste darin zu', () => {
      const m = boardModel(cs, t, 'r', { groups: [gruppe()] })
      expect(m.nodes.map((n) => n.itemId)).toEqual(['r1', 'r2', 'r7', 'r8', 'r9', 'r10'])
      expect(m.runs).toHaveLength(1)
      expect(m.runs[0]).toMatchObject({ groupId: 'g1', label: 'Bildbeschaffung', branches: 2, row: 2 })
      expect(m.runs[0].items.map((n) => n.itemId)).toEqual(['r3', 'r4', 'r5', 'r6'])
      // Die Äste haben keine Spur mehr – und auch keinen eigenen Chip, die Gruppe sagt es ja.
      expect(m.lanes.map((l) => l.chatId)).toEqual(['r'])
      expect(m.collapsed).toEqual([])
    })

    it('zeigt die offene Gruppe mit Kopfzeile und Klammer', () => {
      const m = boardModel(cs, t, 'r', { groups: [gruppe({ closed: false })] })
      expect(m.runs).toEqual([])
      expect(m.heads).toHaveLength(1)
      expect(m.heads[0]).toMatchObject({ groupId: 'g1', label: 'Bildbeschaffung', items: 4, branches: 2, row: 2 })
      // Kopfzeile auf Zeile 2, danach die vier Knoten der Gruppe.
      expect(m.nodes.filter((n) => n.row > 2 && n.row <= m.heads[0].lastRow).map((n) => n.itemId)).toEqual(['r3', 'r4', 'r5', 'r6'])
      // Offen behalten die Äste ihre Spur.
      expect(m.lanes.map((l) => l.chatId)).toEqual(['r', 'a', 'a2'])
    })

    it('übergeht Gruppen, deren Nachrichten es nicht mehr gibt', () => {
      const m = boardModel(cs, t, 'r', { groups: [gruppe({ fromItemId: 'weg' })] })
      expect(m.runs).toEqual([])
      expect(m.nodes.filter((n) => n.chatId === 'r')).toHaveLength(10)
    })
    it('bleibt eine Zeile, auch wenn ein Ast zeitlich mitten in der Gruppe spricht', () => {
      // a1 (Ast) liegt zwischen r5 und r6; die Gruppe r3–r7 ist dadurch nicht am Stück.
      const t2: Record<string, Transcript> = {
        r: Array.from({ length: 10 }, (_, i) => user(`r${i + 1}`, 10 + i * 2)) as unknown as Transcript,
        a: [user('a1', 19)] as unknown as Transcript
      }
      const cs2 = [chat('r', 1), chat('a', 5, 'r', 4)]
      const g = gruppe({ fromItemId: 'r3', toItemId: 'r7', closed: false })
      const m = boardModel(cs2, t2, 'r', { groups: [g] })
      expect(m.heads).toHaveLength(1)
      expect(m.heads[0]).toMatchObject({ items: 5, branches: 1 })
      // Die Klammer reicht bis zum letzten Knoten der Gruppe, auch über den fremden hinweg.
      expect(m.nodes.find((n) => n.itemId === 'r7')!.row).toBe(m.heads[0].lastRow)
      const zu = boardModel(cs2, t2, 'r', { groups: [{ ...g, closed: true }] })
      expect(zu.runs).toHaveLength(1)
      expect(zu.runs[0].items.map((n) => n.itemId)).toEqual(['r3', 'r4', 'r5', 'r6', 'r7'])
    })
  })
})
