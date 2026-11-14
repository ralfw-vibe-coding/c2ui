import { describe, expect, it } from 'vitest'
import { startedTask, taskIdOf, taskReports, withoutReported } from './background'
import type { Block } from './types'

const bash = (id: string, input: Record<string, unknown>): Block => ({ type: 'tool_use', id, name: 'Bash', input }) as unknown as Block

// Wortlaut wie von der Claude-CLI beobachtet.
const meldung = `Dies ist eine Systemmeldung.

<task-notification>
<task-id>bfa9ppq5q</task-id>
<tool-use-id>toolu_01Bg8XoMhw9GLctagGNjkJb3</tool-use-id>
<output-file>/tmp/tasks/bfa9ppq5q.output</output-file>
<status>completed</status>
<summary>Background command "Generate six AI images sequentially in background" completed (exit code 0)</summary>
</task-notification>`

describe('Arbeit im Hintergrund', () => {
  it('erkennt den Start am Werkzeugaufruf', () => {
    const t = startedTask(bash('toolu_1', { command: 'sleep 5', description: 'Sechs Bilder erzeugen', run_in_background: true }), 1000)
    expect(t).toEqual({ id: 'toolu_1', label: 'Sechs Bilder erzeugen', startedAt: 1000 })
    // Manche CLI-Fassungen schreiben „True“ als Text.
    expect(startedTask(bash('toolu_2', { command: 'sleep 5', run_in_background: 'True' }), 1)?.label).toBe('sleep 5')
    expect(startedTask(bash('toolu_3', { command: 'ls' }), 1)).toBeNull()
    expect(startedTask({ type: 'text', text: 'nichts' } as Block, 1)).toBeNull()
  })

  it('liest die Fertigmeldung der CLI', () => {
    const [r] = taskReports(meldung)
    expect(r).toMatchObject({ toolUseId: 'toolu_01Bg8XoMhw9GLctagGNjkJb3', taskId: 'bfa9ppq5q', status: 'completed' })
    expect(r.summary).toContain('Generate six AI images')
    expect(taskReports('nur Text')).toEqual([])
    expect(taskReports(meldung + meldung).length).toBe(2)
  })

  it('nimmt gemeldete Aufgaben aus der Liste – auch über die Id der CLI', () => {
    const tasks = [
      { id: 'toolu_01Bg8XoMhw9GLctagGNjkJb3', label: 'Bilder', startedAt: 1 },
      { id: 'toolu_x', label: 'Anderes', startedAt: 2 }
    ]
    expect(withoutReported(tasks, taskReports(meldung)).map((t) => t.id)).toEqual(['toolu_x'])
    // Ohne tool-use-id hilft die Zuordnung über die Id aus der Startmeldung.
    const ohne = [{ taskId: 'bfa9ppq5q', status: 'completed' }]
    expect(withoutReported(tasks, ohne).length).toBe(2)
    expect(withoutReported(tasks, ohne, new Map([['bfa9ppq5q', 'toolu_01Bg8XoMhw9GLctagGNjkJb3']])).map((t) => t.id)).toEqual(['toolu_x'])
    expect(withoutReported(tasks, [])).toBe(tasks)
  })

  it('findet die Id aus der Startmeldung', () => {
    expect(taskIdOf('Command running in background with ID: bfa9ppq5q. Output is being written to: /tmp/x')).toBe('bfa9ppq5q')
    expect(taskIdOf('Alles erledigt.')).toBeUndefined()
  })
})
