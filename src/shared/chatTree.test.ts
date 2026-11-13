import { describe, expect, it } from 'vitest'
import { chatTree, visibleRows } from './chatTree'
import type { Chat } from './types'

const chat = (id: string, created: number, updated: number, parent?: string): Chat =>
  ({
    id,
    title: id,
    cwd: '/x',
    agent: 'claude',
    permissionMode: 'default',
    sessionId: id,
    sessionStarted: true,
    createdAt: created,
    updatedAt: updated,
    ...(parent ? { forkFrom: { chatId: parent, title: parent } } : {})
  }) as Chat

const ids = (rows: { node: { chat: Chat }; depth: number }[]): string[] => rows.map((r) => `${'.'.repeat(r.depth)}${r.node.chat.id}`)

describe('Chat-Baum', () => {
  it('hängt Nebenchats unter ihren Ursprung, in Reihenfolge des Abzweigens', () => {
    const t = chatTree([chat('a', 1, 10), chat('a2', 5, 6, 'a'), chat('a1', 3, 4, 'a'), chat('a1x', 4, 4, 'a1'), chat('b', 2, 2)])
    expect(ids(visibleRows(t, new Set()))).toEqual(['a', '.a1', '..a1x', '.a2', 'b'])
    expect(t[0].descendants).toBe(3)
  })

  it('ordnet Wurzeln nach der letzten Aktivität im ganzen Teilbaum', () => {
    const t = chatTree([chat('a', 1, 5), chat('b', 2, 8), chat('a1', 3, 20, 'a')])
    expect(t.map((n) => n.chat.id)).toEqual(['a', 'b'])
    expect(t[0].latest).toBe(20)
  })

  it('macht Nebenchats eines gelöschten Ursprungs zu Wurzeln', () => {
    const t = chatTree([chat('a1', 3, 4, 'weg'), chat('b', 2, 2)])
    expect(t.map((n) => n.chat.id)).toEqual(['a1', 'b'])
  })

  it('übersteht Zyklen in kaputten Daten', () => {
    const t = chatTree([chat('x', 1, 1, 'y'), chat('y', 2, 2, 'x')])
    expect(visibleRows(t, new Set()).length).toBe(2)
  })

  it('lässt zugeklappte Teilbäume aus', () => {
    const t = chatTree([chat('a', 1, 10), chat('a1', 3, 4, 'a'), chat('a1x', 4, 4, 'a1')])
    expect(ids(visibleRows(t, new Set(['a1'])))).toEqual(['a', '.a1'])
    expect(ids(visibleRows(t, new Set(['a'])))).toEqual(['a'])
  })
})
