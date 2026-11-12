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
})
