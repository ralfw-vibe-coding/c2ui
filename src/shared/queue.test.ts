import { describe, expect, it } from 'vitest'
import { afterTurn, EMPTY_QUEUE, enqueue, queuedMeta, removeQueued, resume, sendFailed, shouldQueue, takeNext, type QueuedMessage } from './queue'

const msg = (id: string, extra: Partial<QueuedMessage> = {}): QueuedMessage => ({ id, text: id, refs: [], attachments: [], ...extra })

describe('Warteschlange', () => {
  it('reiht ein und gibt in Reihenfolge heraus, nur wenn der Chat frei ist', () => {
    let q = enqueue(enqueue(EMPTY_QUEUE, msg('a')), msg('b'))
    expect(takeNext(q, true).next).toBeUndefined()
    const r1 = takeNext(q, false)
    expect(r1.next?.id).toBe('a')
    q = r1.queue
    const r2 = takeNext(q, false)
    expect(r2.next?.id).toBe('b')
    expect(r2.queue).toEqual(EMPTY_QUEUE)
    expect(takeNext(r2.queue, false).next).toBeUndefined()
  })

  it('hält nach Abbruch oder Fehler an, aber nur wenn etwas wartet', () => {
    expect(afterTurn(EMPTY_QUEUE, true, 'Abgebrochen.')).toEqual(EMPTY_QUEUE)
    const q = afterTurn(enqueue(EMPTY_QUEUE, msg('a')), true, 'Abgebrochen.')
    expect(q.paused).toBe(true)
    expect(q.reason).toBe('Antwort abgebrochen')
    expect(afterTurn(enqueue(EMPTY_QUEUE, msg('a')), true, 'kaputt').reason).toBe('Letzter Turn fehlgeschlagen')
    expect(takeNext(q, false).next).toBeUndefined()
    expect(takeNext(resume(q), false).next?.id).toBe('a')
  })

  it('läuft nach erfolgreichem Turn weiter', () => {
    const q = afterTurn(enqueue(EMPTY_QUEUE, msg('a')), false)
    expect(q.paused).toBe(false)
  })

  it('stellt nach Sendefehler vorn wieder ein und hält an', () => {
    const q = sendFailed(enqueue(EMPTY_QUEUE, msg('b')), msg('a'), 'Fehler')
    expect(q.items.map((m) => m.id)).toEqual(['a', 'b'])
    expect(q.paused).toBe(true)
  })

  it('entfernt einzelne Nachrichten; leer heißt zurückgesetzt', () => {
    const q = { ...enqueue(enqueue(EMPTY_QUEUE, msg('a')), msg('b')), paused: true }
    expect(removeQueued(q, 'a').items.map((m) => m.id)).toEqual(['b'])
    expect(removeQueued(removeQueued(q, 'a'), 'b')).toEqual(EMPTY_QUEUE)
  })

  it('reiht neue Eingaben ein, solange der Chat arbeitet oder die Schlange läuft', () => {
    expect(shouldQueue(EMPTY_QUEUE, true)).toBe(true)
    expect(shouldQueue(EMPTY_QUEUE, false)).toBe(false)
    const q = enqueue(EMPTY_QUEUE, msg('a'))
    expect(shouldQueue(q, false)).toBe(true)
    // Angehalten: direkt senden, die Schlange wartet weiter.
    expect(shouldQueue({ ...q, paused: true }, false)).toBe(false)
  })

  it('beschreibt Bezüge und Anhänge', () => {
    expect(queuedMeta(msg('a'))).toBe('')
    const a = { path: '/x', name: 'x', kind: 'file' } as never
    expect(queuedMeta(msg('a', { refs: [{ id: '1', quote: 'q', note: '' }], attachments: [a, a] }))).toBe('1 Bezug · 2 Anhänge')
  })
})
