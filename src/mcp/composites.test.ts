import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { basicCatalog } from '@a2ui/web_core/v1_0'
import { BUILTIN_COMPONENT_NAMES, callMessages } from '@shared/a2ui'
import { EXTRA_APIS } from '@shared/a2ui-catalog'
import { checkCompositeInstance, expandComposites, parseCompositeDef, setComposites, type CompositeDef } from '@shared/a2ui-composites'
import { loadComposites } from '../main/componentsLoader'
import { validate } from './validate'

const reserved = new Set(BUILTIN_COMPONENT_NAMES)
const exampleDir = join(__dirname, '../../resources/example-components')
const contactCard = JSON.parse(readFileSync(join(exampleDir, 'ContactCard/component.json'), 'utf8'))

const Label: CompositeDef = {
  name: 'Label',
  description: 'Beschriftung mit Wert',
  properties: { title: { type: 'DynamicString', required: true }, value: { type: 'DynamicString' } },
  template: [
    { id: 'root', component: 'Row', children: ['t', 'v'] },
    { id: 't', component: 'Text', text: '$title' },
    { id: 'v', component: 'Text', variant: 'caption', text: '$value' }
  ]
}

afterEach(() => setComposites([]))

describe('eigene Komponenten', () => {
  it('eingebaute Namen entsprechen dem Katalog', () => {
    const catalog = [...basicCatalog.components.keys(), ...EXTRA_APIS.map((a) => a.name)]
    expect(new Set(BUILTIN_COMPONENT_NAMES)).toEqual(new Set(catalog))
  })

  it('Beispielkomponente ist gültig und wird geladen', () => {
    expect(parseCompositeDef(contactCard, reserved).errors).toEqual([])
    const r = loadComposites(exampleDir)
    expect(r.errors).toEqual([])
    expect(r.defs.map((d) => d.name)).toEqual(['ContactCard'])
  })

  it('fehlerhafte Definitionen werden erkannt', () => {
    const errs = (j: object) => parseCompositeDef(j, reserved).errors.join(' | ')
    expect(errs({ ...contactCard, name: 'Table' })).toMatch(/eingebaute Komponente/)
    expect(errs({ ...contactCard, name: 'kleingeschrieben' })).toMatch(/PascalCase/)
    expect(errs({ ...contactCard, template: [{ id: 'x', component: 'Text', text: '$gibtsnicht' }] })).toMatch(/root.*|gibtsnicht/)
    expect(errs({ ...contactCard, properties: { a: { type: 'Zahl' } } })).toMatch(/type/)
  })

  it('löst Instanzen auf: IDs, Platzhalter, Bindungen, fehlende optionale Werte, weight', () => {
    setComposites([Label])
    const out = expandComposites([
      { id: 'l1', component: 'Label', title: 'Umsatz', value: { '@path': '/u' }, weight: 2 },
      { id: 'l2', component: 'Label', title: 'Nur Titel' }
    ]) as any[]
    expect(out.map((c) => c.id)).toEqual(['l1', 'l1__t', 'l1__v', 'l2', 'l2__t'])
    expect(out[0]).toMatchObject({ component: 'Row', children: ['l1__t', 'l1__v'], weight: 2 })
    expect(out[2].text).toEqual({ '@path': '/u' })
    // fehlender optionaler Wert: der Teil entfällt samt Verweis
    expect(out[3].children).toEqual(['l2__t'])
  })

  it('löst verschachtelte eigene Komponenten auf', () => {
    const Pair: CompositeDef = {
      name: 'Pair',
      description: 'zwei Labels',
      properties: { a: { type: 'DynamicString', required: true } },
      template: [
        { id: 'root', component: 'Column', children: ['x', 'y'] },
        { id: 'x', component: 'Label', title: '$a' },
        { id: 'y', component: 'Label', title: 'fest' }
      ]
    }
    setComposites([Label, Pair])
    const ids = (expandComposites([{ id: 'p', component: 'Pair', a: 'A' }]) as any[]).map((c) => `${c.id}:${c.component}`)
    expect(ids).toEqual(['p:Column', 'p__x:Row', 'p__x__t:Text', 'p__y:Row', 'p__y__t:Text'])
  })

  it('prüft Instanzen: Pflicht, Typ, enum, unbekannte Eigenschaften', () => {
    const def = parseCompositeDef(contactCard, reserved).def!
    const e = checkCompositeInstance({ id: 'k', component: 'ContactCard', role: 5, status: 'rot', telefon: 'x' }, def).join(' | ')
    expect(e).toMatch(/„name“ fehlt/)
    expect(e).toMatch(/„role“ hat nicht den Typ DynamicString/)
    expect(e).toMatch(/„status“ muss einer von/)
    expect(e).toMatch(/Unbekannte Eigenschaft „telefon“/)
  })

  it('Validierung: Beispiel-Instanz wird angenommen, Fehler beziehen sich auf die Instanz', () => {
    setComposites(loadComposites(exampleDir).defs)
    const ok = validate([], [
      { createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'ContactCard', ...contactCard.example }] } }
    ])
    expect(ok.errors).toEqual([])
    const bad = validate([], [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'ContactCard' }] } }])
    expect(bad.errors[0]).toMatch(/ContactCard „root“: Eigenschaft „name“ fehlt/)
    // Für den Renderer: aufgelöste Nachricht enthält nur eingebaute Komponenten
    const msgs = callMessages({ messages: [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'ContactCard', name: 'X' }] } }] })
    expect(msgs[0].createSurface.components.every((c: any) => reserved.has(c.component))).toBe(true)
  })
})
