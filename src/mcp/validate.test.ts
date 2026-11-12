import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callMessages, CLAUDE2UI_CATALOG_ID } from '@shared/a2ui'
import { EXTRA_APIS } from '@shared/a2ui-catalog'
import { validate } from './validate'

// Die Beispiele aus dem Skill müssen gültig sein – sonst lernt Claude Falsches.
const skill = readFileSync(join(__dirname, '../../resources/a2ui-plugin/skills/a2ui/SKILL.md'), 'utf8')
const examples = [...skill.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]))
const [create, update, chart] = examples.filter((e) => e.messages)

describe('A2UI-Validierung', () => {
  it('Skill-Beispiele: Screen anlegen und in-place aktualisieren', () => {
    const c = validate([], callMessages(create))
    expect(c).toMatchObject({ ok: true, created: ['zinsrechner'] })
    const u = validate(callMessages(create), callMessages(update))
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

  it('Skill-Beispiel: Chart-Dashboard', () => {
    expect(validate([], callMessages(chart))).toMatchObject({ ok: true, created: ['umsatz'] })
  })

  it('Charts: Pflichtfelder und Tippfehler werden erkannt', () => {
    const mk = (c: object) => [{ createSurface: { surfaceId: 's', components: [{ id: 'root', ...c }] } }]
    expect(validate([], mk({ component: 'BarChart', data: [], xKey: 'x' })).errors[0]).toMatch(/series/)
    expect(validate([], mk({ component: 'LineChart', data: [], xKey: 'x', series: [{ key: 'y' }], seriess: 1 })).ok).toBe(false)
    expect(validate([], mk({ component: 'PieChart', data: { '@path': '/d' }, donut: true })).ok).toBe(true)
  })

  it('Image akzeptiert lokale Pfade', () => {
    for (const url of ['plots/a.png', '~/Bilder/b.jpg', '/tmp/c.webp', 'https://x/y.png']) {
      const r = validate([], [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'Image', url }] } }])
      expect(r.errors).toEqual([])
    }
  })

  it('normalisiert auf den Claude2UI-Katalog', () => {
    expect(callMessages({ messages: [{ createSurface: { surfaceId: 's' } }] })[0].createSurface.catalogId).toBe(CLAUDE2UI_CATALOG_ID)
  })

  it('Doku der Zusatzkomponenten nennt jede Eigenschaft', () => {
    const doc = readFileSync(join(__dirname, '../../resources/a2ui-plugin/skills/a2ui/extra-components.md'), 'utf8')
    for (const api of EXTRA_APIS) {
      expect(doc).toContain(`### ${api.name}`)
      const keys = Object.keys((api.schema as any).shape ?? (api.schema as any)._def.schema?.shape ?? {})
      expect(keys.length).toBeGreaterThan(0)
      for (const k of keys) expect(doc, `${api.name}.${k}`).toContain(`\`${k}\``)
    }
  })

  it('neue Widgets: gültige Beispiele werden angenommen', () => {
    const comps = [
      { id: 'root', component: 'Column', children: ['t', 'm', 'p', 'a', 'b', 'c', 's'] },
      {
        id: 't', component: 'Table', title: 'Aufträge', data: { '@path': '/rows' }, selected: { '@path': '/auswahl' },
        columns: [{ key: 'kunde', label: 'Kunde' }, { key: 'betrag', format: 'currency' }, { key: 'datum', format: 'date' }],
        action: { event: { name: 'zeile', context: { zeile: { '@path': '/auswahl' } } } }
      },
      { id: 'm', component: 'Metric', label: 'Umsatz', value: 12345, format: 'currency', delta: 4.2, deltaLabel: 'ggü. Vormonat', trend: [1, 3, 2, 5] },
      { id: 'p', component: 'Progress', value: { '@path': '/fortschritt' }, label: 'Import', tone: 'success' },
      { id: 'a', component: 'Alert', tone: 'warning', title: 'Achtung', text: 'Noch **3** offene Punkte' },
      { id: 'b', component: 'Badge', text: 'offen', tone: 'info' },
      { id: 'c', component: 'CodeBlock', code: 'print(1)', language: 'python', title: 'main.py' },
      { id: 's', component: 'ScatterChart', data: [{ x: 1, y: 2, g: 'A' }], xKey: 'x', yKey: 'y', groupKey: 'g' }
    ]
    const r = validate([], [{ createSurface: { surfaceId: 'w', components: comps, dataModel: { rows: [], fortschritt: 40 } } }])
    expect(r.errors).toEqual([])
  })

  it('neue Widgets: typische Fehler werden erkannt', () => {
    const mk = (c: object) => [{ createSurface: { surfaceId: 's', components: [{ id: 'root', ...c }] } }]
    expect(validate([], mk({ component: 'Table', data: [] })).errors[0]).toMatch(/columns/)
    expect(validate([], mk({ component: 'Table', data: [], columns: [{ key: 'a', format: 'euro' }] })).ok).toBe(false)
    expect(validate([], mk({ component: 'Metric', value: 1 })).errors[0]).toMatch(/label/)
    expect(validate([], mk({ component: 'Alert', tone: 'danger', text: 'x' })).ok).toBe(false)
  })
})
