import { describe, expect, it } from 'vitest'
import { doneMessage, isOnScreen, isSignOfLife, shouldNotify, stalledMessage, TurnWatch } from './notifications'
import type { LayoutNode } from '@shared/types'

describe('Benachrichtigungen', () => {
  it('meldet einen hängenden Chat einmal je Turn', () => {
    const w = new TurnWatch()
    const t0 = 1_000_000
    w.setBusy('a', true, t0)
    expect(w.stalled(3, t0 + 2 * 60_000)).toEqual([])
    const hit = w.stalled(3, t0 + 3 * 60_000)
    expect(hit).toEqual([{ chatId: 'a', silentMs: 180_000 }])
    // nicht noch einmal im selben Turn
    expect(w.stalled(3, t0 + 9 * 60_000)).toEqual([])
    // Lebenszeichen setzt die Uhr zurück; der nächste Turn meldet wieder
    w.setBusy('a', false, t0)
    w.setBusy('a', true, t0 + 10 * 60_000)
    w.touch('a', t0 + 12 * 60_000)
    expect(w.stalled(3, t0 + 14 * 60_000)).toEqual([])
    expect(w.stalled(3, t0 + 15 * 60_000 + 1)).toEqual([{ chatId: 'a', silentMs: 180_001 }])
  })

  it('beobachtet nur arbeitende Chats', () => {
    const w = new TurnWatch()
    w.touch('a', 0) // nicht beschäftigt → wird nicht beobachtet
    expect(w.stalled(1, 10 * 60_000)).toEqual([])
    w.setBusy('b', true, 0)
    w.forget('b')
    expect(w.stalled(1, 10 * 60_000)).toEqual([])
  })

  it('zählt Zustandsmeldungen nicht als Lebenszeichen', () => {
    expect(isSignOfLife({ kind: 'text-delta', msgId: 'm', index: 0, text: 'x', blockType: 'text' })).toBe(true)
    expect(isSignOfLife({ kind: 'session', sessionId: 's' })).toBe(false)
    expect(isSignOfLife({ kind: 'context', used: 5 })).toBe(false)
  })

  it('benachrichtigt nur, wenn man den Chat nicht ohnehin sieht', () => {
    expect(shouldNotify({ enabled: true, focused: true, onScreen: true })).toBe(false)
    expect(shouldNotify({ enabled: true, focused: false, onScreen: true })).toBe(true)
    expect(shouldNotify({ enabled: true, focused: true, onScreen: false })).toBe(true)
    expect(shouldNotify({ enabled: false, focused: false, onScreen: false })).toBe(false)
  })

  it('findet offene Chats im Layout', () => {
    const root: LayoutNode = {
      type: 'split',
      id: 's',
      direction: 'row',
      sizes: [50, 50],
      children: [
        { type: 'leaf', id: 'l1', chatId: 'a' },
        { type: 'leaf', id: 'l2', chatId: null }
      ]
    }
    expect(isOnScreen(root, 'a')).toBe(true)
    expect(isOnScreen(root, 'b')).toBe(false)
  })

  it('schreibt verständliche Meldungen', () => {
    expect(doneMessage('Hausarbeit', false)).toEqual({ title: 'Fertig: Hausarbeit', body: 'Der Chat hat geantwortet.' })
    expect(doneMessage('Hausarbeit', true, 'Exit 1').title).toBe('Fehlgeschlagen: Hausarbeit')
    expect(stalledMessage('Quellen', 185_000).body).toMatch(/Seit 3 Minuten/)
    expect(stalledMessage('Quellen', 61_000).body).toMatch(/Seit 1 Minute\b/)
  })
})
