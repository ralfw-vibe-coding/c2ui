import { describe, expect, it } from 'vitest'
import { shortToolName, toUnits } from './turns'
import type { Transcript } from './types'

const tool = (id: string, name = 'Bash') => ({ type: 'tool_use' as const, id, name, input: {}, result: { content: 'ok', isError: false } })
const text = (t: string) => ({ type: 'text' as const, text: t })
const render = (id: string) => ({ ...tool(id, 'mcp__a2ui__render_ui'), input: { messages: [] } })

const shape = (t: Transcript, collapse = true) =>
  toUnits(t, collapse).map((u) =>
    u.kind === 'item' ? u.item.type : u.kind === 'steps' ? `steps(${u.blocks.length})` : u.block.type === 'tool_use' ? 'tool' : u.block.type
  )

describe('Turns gruppieren', () => {
  it('fasst Werkzeuge und Zwischentexte vor dem letzten Werkzeug zusammen, Antwort und Screen bleiben sichtbar', () => {
    const t: Transcript = [
      { type: 'user', id: 'u', text: 'zeig', ts: 1 },
      { type: 'assistant', id: 'a1', blocks: [text('Ich schaue nach …'), tool('t1')] },
      { type: 'assistant', id: 'a2', blocks: [tool('t2', 'mcp__a2ui__describe_components'), text('Gefunden, ich baue …'), tool('t3')] },
      { type: 'assistant', id: 'a3', blocks: [render('r1'), text('Fertig.')] },
      { type: 'turn', id: 'x', durationMs: 1, isError: false }
    ]
    expect(shape(t)).toEqual(['user', 'steps(5)', 'tool', 'text', 'turn'])
    expect(shape(t, false)).toEqual(['user', 'text', 'tool', 'tool', 'text', 'tool', 'tool', 'text', 'turn'])
  })

  it('ein Screen zwischen Werkzeugen teilt die Schritte in zwei Gruppen', () => {
    const t: Transcript = [
      { type: 'user', id: 'u', text: 'x', ts: 1 },
      { type: 'assistant', id: 'a', blocks: [tool('t1'), render('r'), tool('t2'), text('Antwort')] }
    ]
    expect(shape(t)).toEqual(['user', 'steps(1)', 'tool', 'steps(1)', 'text'])
  })

  it('ohne Werkzeuge bleibt die Antwort unverändert; leere Gedanken verschwinden', () => {
    const t: Transcript = [
      { type: 'user', id: 'u', text: 'x', ts: 1 },
      { type: 'assistant', id: 'a', blocks: [{ type: 'thinking', text: '' }, text('Hallo')] }
    ]
    expect(shape(t)).toEqual(['user', 'text'])
  })

  it('markiert den letzten Turn', () => {
    const t: Transcript = [
      { type: 'user', id: 'u1', text: 'a', ts: 1 },
      { type: 'assistant', id: 'a1', blocks: [tool('t1'), text('x')] },
      { type: 'user', id: 'u2', text: 'b', ts: 2 },
      { type: 'assistant', id: 'a2', blocks: [tool('t2')] }
    ]
    expect(toUnits(t).filter((u) => u.kind === 'steps').map((u) => (u as { lastTurn: boolean }).lastTurn)).toEqual([false, true])
  })

  it('kurze Werkzeugnamen', () => {
    expect(shortToolName('mcp__a2ui__describe_components')).toBe('describe_components')
    expect(shortToolName('Bash')).toBe('Bash')
  })
})
