import { describe, expect, it } from 'vitest'
import { boardModel, messageLabel, rootOf, sameAsTitle } from './board'
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
})
