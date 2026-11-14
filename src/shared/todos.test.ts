import { describe, expect, it } from 'vitest'
import { isTodoCall, todoProgress, todoSteps } from './todos'
import type { Block } from './types'

describe('Aufgabenliste des Agenten', () => {
  it('liest Claudes TodoWrite', () => {
    const steps = todoSteps('TodoWrite', {
      todos: [
        { content: 'Code ansehen', status: 'completed', activeForm: 'Sehe Code an' },
        { content: 'Umbauen', status: 'in_progress', activeForm: 'Baue um' },
        { content: 'Prüfen', status: 'pending', activeForm: 'Prüfe' }
      ]
    })
    expect(steps).toEqual([
      { text: 'Code ansehen', status: 'done' },
      { text: 'Umbauen', status: 'doing' },
      { text: 'Prüfen', status: 'pending' }
    ])
  })

  it('liest Codex’ update_plan (Feld „step“)', () => {
    expect(todoSteps('Plan', { explanation: 'Los', plan: [{ step: 'Erst dies', status: 'completed' }, { step: 'Dann das', status: 'pending' }] })).toEqual([
      { text: 'Erst dies', status: 'done' },
      { text: 'Dann das', status: 'pending' }
    ])
    expect(todoSteps('update_plan', { plan: ['Nur Text'] })).toEqual([{ text: 'Nur Text', status: 'pending' }])
  })

  it('lässt andere Werkzeuge und leere Listen in Ruhe', () => {
    expect(todoSteps('Bash', { todos: [{ content: 'x', status: 'pending' }] })).toBeNull()
    expect(todoSteps('TodoWrite', { todos: [] })).toBeNull()
    expect(todoSteps('TodoWrite', 'nichts')).toBeNull()
    expect(todoSteps('TodoWrite', { todos: [{ status: 'pending' }] })).toBeNull()
  })

  it('erkennt den Block und fasst den Stand zusammen', () => {
    const block = { type: 'tool_use', id: 't', name: 'TodoWrite', input: { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }] } } as unknown as Block
    expect(isTodoCall(block)).toBe(true)
    expect(isTodoCall({ type: 'text', text: 'A' } as Block)).toBe(false)
    expect(todoProgress(todoSteps('TodoWrite', (block as { input: unknown }).input)!)).toEqual({ done: 1, total: 2, current: 'B' })
    // Ohne laufenden Schritt zeigt der Kopf den nächsten offenen.
    expect(todoProgress([{ text: 'A', status: 'done' }, { text: 'B', status: 'pending' }])).toEqual({ done: 1, total: 2, current: 'B' })
  })
})
