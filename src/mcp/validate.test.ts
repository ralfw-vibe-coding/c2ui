import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callMessages } from '@shared/a2ui'
import { validate } from './validate'

// Die Beispiele aus dem Skill müssen gültig sein – sonst lernt Claude Falsches.
const skill = readFileSync(join(__dirname, '../../resources/a2ui-plugin/skills/a2ui/SKILL.md'), 'utf8')
const examples = [...skill.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]))
const [create, , update] = examples.filter((e) => e.messages)

describe('A2UI-Validierung', () => {
  it('Skill-Beispiele: Screen anlegen und in-place aktualisieren', () => {
    const c = validate([], callMessages(create))
    expect(c).toMatchObject({ ok: true, created: ['zinsrechner'] })
    const u = validate(callMessages(create), callMessages(update ?? examples[examples.length - 1]))
    expect(u.errors).toEqual([])
    expect(u.updated).toEqual(['zinsrechner'])
  })

  it('meldet fehlende Pflichtfelder mit Ort', () => {
    const r = validate([], [
      { version: '1.0', createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'Text' }] } }
    ])
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/Nachricht 1 \(createSurface, Surface „s“\).*text/)
  })

  it('meldet fehlendes root und hängende Verweise', () => {
    const r = validate([], [
      {
        createSurface: {
          surfaceId: 's',
          components: [{ id: 'col', component: 'Column', children: ['a', 'fehlt'] }, { id: 'a', component: 'Text', text: 'x' }]
        }
      }
    ])
    expect(r.errors.join('\n')).toMatch(/root/)
    expect(r.errors.join('\n')).toMatch(/fehlende Komponente „fehlt“/)
  })

  it('verbietet doppeltes createSurface und Updates auf unbekannte Surfaces', () => {
    const base = [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'Text', text: 'x' }] } }]
    expect(validate(base, base).errors[0]).toMatch(/existiert schon/)
    expect(validate([], [{ updateDataModel: { surfaceId: 'x', path: '/a', value: 1 } }]).errors[0]).toMatch(/existiert nicht/)
  })
})
