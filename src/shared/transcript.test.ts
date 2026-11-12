import { describe, expect, it } from 'vitest'
import { applyEvent } from './transcript'
import type { AgentEvent, Transcript } from './types'

const run = (events: AgentEvent[]): Transcript => events.reduce(applyEvent, [] as Transcript)

describe('transcript', () => {
  it('baut Text aus Deltas und ersetzt ihn durch die finale Nachricht', () => {
    const t = run([
      { kind: 'user', id: 'u1', text: 'hi', ts: 1 },
      { kind: 'text-delta', msgId: 'm1', index: 0, text: 'Hal', blockType: 'text' },
      { kind: 'text-delta', msgId: 'm1', index: 0, text: 'lo', blockType: 'text' },
      { kind: 'assistant', msgId: 'm1', index: 0, blocks: [{ type: 'text', text: 'Hallo!' }] }
    ])
    expect(t).toEqual([
      { type: 'user', id: 'u1', text: 'hi', ts: 1 },
      { type: 'assistant', id: 'm1', blocks: [{ type: 'text', text: 'Hallo!' }] }
    ])
  })

  it('platziert Blöcke per Index und hängt Tool-Ergebnisse an', () => {
    const t = run([
      { kind: 'assistant', msgId: 'm1', index: 0, blocks: [{ type: 'thinking', text: '' }] },
      { kind: 'assistant', msgId: 'm1', index: 1, blocks: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a' } }] },
      { kind: 'tool-result', toolUseId: 't1', content: 'inhalt', isError: false },
      { kind: 'assistant', msgId: 'm2', index: 0, blocks: [{ type: 'text', text: 'fertig' }] },
      { kind: 'turn-end', id: 'r1', durationMs: 10, isError: false }
    ])
    expect(t[0]).toEqual({
      type: 'assistant',
      id: 'm1',
      blocks: [
        { type: 'thinking', text: '' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a' }, result: { content: 'inhalt', isError: false } }
      ]
    })
    expect(t.map((i) => i.type)).toEqual(['assistant', 'assistant', 'turn'])
  })

  it('rechnet Kosten pro Turn aus der Sessionsumme (auch über Neustarts hinweg)', () => {
    const t = run([
      { kind: 'turn-end', id: 'a', durationMs: 1, isError: false, costTotalUsd: 0.01 },
      { kind: 'turn-end', id: 'b', durationMs: 1, isError: false, costTotalUsd: 0.04 },
      { kind: 'notice', id: 'n', text: 'Hinweis' },
      { kind: 'turn-end', id: 'c', durationMs: 1, isError: false, costTotalUsd: 0.05, model: 'm' }
    ])
    const costs = t.filter((i) => i.type === 'turn').map((i) => Number((i as { costUsd?: number }).costUsd?.toFixed(4)))
    expect(costs).toEqual([0.01, 0.03, 0.01])
    expect(t[2]).toEqual({ type: 'notice', id: 'n', text: 'Hinweis' })
    expect((t[3] as { model?: string }).model).toBe('m')
  })
})
