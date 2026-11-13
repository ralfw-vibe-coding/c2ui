import { describe, expect, it } from 'vitest'
import { forkAnchors, forkChain } from './forks'
import type { Chat } from './types'

// Ursprung: u1, a1 (Schritte + Text), u2, a2, u3, a3
const units = [
  { itemId: 'u1', isUser: true },
  { itemId: 'a1', isUser: false },
  { itemId: 'a1', isUser: false },
  { itemId: 'u2', isUser: true },
  { itemId: 'a2', isUser: false },
  { itemId: 'u3', isUser: true },
  { itemId: 'a3', isUser: false }
]

describe('Markierungen im Ursprung', () => {
  it('steht nach der letzten Einheit der zitierten Antwort', () => {
    const m = forkAnchors(units, [{ id: 'x', at: { turn: 3, itemId: 'a1' } }])
    expect([...m]).toEqual([[2, ['x']]])
  })

  it('fällt ohne Eintrag auf die Turn-Anzahl zurück', () => {
    expect([...forkAnchors(units, [{ id: 'x', at: { turn: 2 } }])]).toEqual([[4, ['x']]])
    expect([...forkAnchors(units, [{ id: 'x', at: { turn: 3 } }])]).toEqual([[6, ['x']]])
    // Eintrag nicht (mehr) da → Turn
    expect([...forkAnchors(units, [{ id: 'x', at: { turn: 1, itemId: 'weg' } }])]).toEqual([[2, ['x']]])
  })

  it('sammelt mehrere Nebenchats an derselben Stelle, ohne Abzweigpunkt keine Markierung', () => {
    const m = forkAnchors(units, [
      { id: 'x', at: { turn: 3, itemId: 'a2' } },
      { id: 'y', at: { turn: 3, itemId: 'a2' } },
      { id: 'alt' }
    ])
    expect([...m]).toEqual([[4, ['x', 'y']]])
    expect(forkAnchors([], [{ id: 'x', at: { turn: 1 } }]).size).toBe(0)
  })
})

const chat = (id: string, parent?: string, parentTitle = parent ?? ''): Chat =>
  ({ id, title: `T-${id}`, ...(parent ? { forkFrom: { chatId: parent, title: parentTitle } } : {}) }) as Chat

describe('Brotkrumen', () => {
  it('liefert die Kette von der Wurzel bis zum Ursprung', () => {
    const chats = [chat('r'), chat('a', 'r'), chat('b', 'a')]
    expect(forkChain(chats, 'b')).toEqual([
      { chatId: 'r', title: 'T-r', childId: 'a' },
      { chatId: 'a', title: 'T-a', childId: 'b' }
    ])
    expect(forkChain(chats, 'r')).toEqual([])
  })

  it('zeigt gelöschte Ursprünge mit gemerktem Titel und endet dort', () => {
    expect(forkChain([chat('b', 'weg', 'Alter Titel')], 'b')).toEqual([{ chatId: undefined, title: 'Alter Titel', childId: 'b' }])
  })

  it('übersteht Zyklen', () => {
    expect(forkChain([chat('x', 'y'), chat('y', 'x')], 'x').length).toBeLessThanOrEqual(2)
  })
})
