import { describe, expect, it } from 'vitest'
import { boardModel, messageLabel, nodeOfItem, rootOf, sameAsTitle } from './board'
import { A2UI_ACTION_PREFIX } from './a2ui'
import type { Chat, Transcript } from './types'

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
  describe('lange Strecken', () => {
    // Ein Chat mit zwanzig gewöhnlichen Nachrichten, ein Ast zweigt nach der achten ab.
    const lang: Record<string, Transcript> = {
      r: Array.from({ length: 20 }, (_, i) => user(`r${i + 1}`, 10 + i)) as unknown as Transcript,
      a: [user('a1', 100)] as unknown as Transcript
    }
    const langChats = [chat('r', 1), chat('a', 90, 'r', 8)]

    it('fasst zusammen, was zwischen den bemerkenswerten Stellen liegt', () => {
      const m = boardModel(langChats, lang, 'r')
      // Sichtbar bleiben der erste Knoten, die Abzweigstelle (r8) und der letzte.
      expect(m.nodes.filter((n) => n.chatId === 'r').map((n) => n.itemId)).toEqual(['r1', 'r8', 'r20'])
      expect(m.runs.map((r) => ({ key: r.key, anzahl: r.items.length, row: r.row }))).toEqual([
        { key: 'r2', anzahl: 6, row: 1 },
        { key: 'r9', anzahl: 11, row: 3 }
      ])
      // Zeilen sind lückenlos, Knoten und Strecken gemeinsam.
      expect([...m.nodes, ...m.runs].map((x) => x.row).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
      // Die Kante zum Ast zeigt weiter auf die sichtbare Abzweigstelle.
      expect(m.edges[0].from.row).toBe(m.nodes.find((n) => n.itemId === 'r8')!.row)
    })

    it('zeigt eine aufgeklappte Strecke wieder einzeln', () => {
      const m = boardModel(langChats, lang, 'r', { expanded: new Set(['r2']) })
      expect(m.runs.map((r) => r.key)).toEqual(['r9'])
      expect(m.nodes.filter((n) => n.chatId === 'r').map((n) => n.itemId)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r20'])
    })

    it('hält die Stelle sichtbar, an der man gerade liest', () => {
      const m = boardModel(langChats, lang, 'r', { keep: new Set(['r12']) })
      expect(m.nodes.map((n) => n.itemId)).toContain('r12')
      // Die hintere Strecke zerfällt: drei davor sind zu wenig zum Zusammenfassen, sieben danach nicht.
      expect(m.runs.map((r) => ({ key: r.key, anzahl: r.items.length }))).toEqual([
        { key: 'r2', anzahl: 6 },
        { key: 'r13', anzahl: 7 }
      ])
      expect(m.nodes.filter((n) => n.chatId === 'r').map((n) => n.itemId)).toEqual(['r1', 'r8', 'r9', 'r10', 'r11', 'r12', 'r20'])
    })

    it('fasst nichts zusammen, wenn man es abschaltet oder die Strecke kurz ist', () => {
      expect(boardModel(langChats, lang, 'r', { minRun: 0 }).runs).toEqual([])
      expect(boardModel(langChats, lang, 'r', { minRun: 0 }).nodes.length).toBe(21)
      // Vier dazwischen sind weniger als die Voreinstellung von fünf.
      const kurz = { r: Array.from({ length: 6 }, (_, i) => user(`r${i + 1}`, 10 + i)) as unknown as Transcript }
      expect(boardModel([chat('r', 1)], kurz, 'r').runs).toEqual([])
    })

    it('nimmt die alte Aufrufform mit eingeklappten Ästen weiter an', () => {
      const m = boardModel(langChats, lang, 'r', new Set(['a']))
      expect(m.lanes.map((l) => l.chatId)).toEqual(['r'])
      expect(m.collapsed[0]).toMatchObject({ chatId: 'a', row: m.nodes.find((n) => n.itemId === 'r8')!.row })
    })
  })
})
