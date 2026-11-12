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

  it('Beispiele aus docs/eigene-komponenten.md sind gültig und ihre Beispiel-Instanzen werden angenommen', () => {
    const doc = readFileSync(join(__dirname, '../../docs/eigene-komponenten.md'), 'utf8')
    const defs = [...doc.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((m) => {
        try {
          return JSON.parse(m[1])
        } catch {
          return null // Ausschnitte (z. B. zwei Komponenten mit Komma) sind kein vollständiges JSON
        }
      })
      .filter((j) => j && j.template)
    expect(defs.map((d) => d.name)).toEqual(['KpiTile', 'Section', 'ConfirmBox'])
    const parsed = defs.map((d) => {
      const r = parseCompositeDef(d, reserved)
      expect(r.errors, d.name).toEqual([])
      return r.def!
    })
    setComposites(parsed)
    for (const def of parsed) {
      // Slots (Child) brauchen existierende Komponenten
      const slots = Object.entries(def.properties)
        .filter(([, p]) => p.type === 'Child')
        .map(([k]) => ({ id: (def.example as any)[k], component: 'Text', text: 'Inhalt' }))
      const r = validate([], [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: def.name, ...def.example }, ...slots] } }])
      expect(r.errors, def.name).toEqual([])
    }
  })

  it('zu tiefe oder zirkuläre Verschachtelung wird gemeldet', () => {
    const Loop: CompositeDef = { name: 'Loop', description: 'x', properties: {}, template: [{ id: 'root', component: 'Loop' }] }
    setComposites([Loop])
    const r = validate([], [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'Loop' }] } }])
    expect(r.ok).toBe(false)
  })

  it('Platzhalter mitten im Text: feste Werte, Bindungen (formatString), fehlende Werte, fremde $wörter', () => {
    const Mail: CompositeDef = {
      name: 'Mail',
      description: 'Mail-Knopf',
      properties: { email: { type: 'DynamicString' }, name: { type: 'DynamicString', required: true } },
      template: [
        { id: 'root', component: 'Column', children: ['gruss', 'btn'] },
        { id: 'gruss', component: 'Text', text: 'Hallo $name – kostet $5' },
        { id: 'btnText', component: 'Text', text: 'Mail' },
        { id: 'btn', component: 'Button', child: 'btnText', action: { functionCall: { '@call': 'openUrl', args: { url: 'mailto:$email' } } } }
      ]
    }
    setComposites([Mail])
    const lit = expandComposites([{ id: 'm', component: 'Mail', name: 'Ada', email: 'ada@x.org' }]) as any[]
    expect(lit.find((c) => c.id === 'm__gruss').text).toBe('Hallo Ada – kostet $5')
    expect(lit.find((c) => c.id === 'm__btn').action.functionCall.args.url).toBe('mailto:ada@x.org')

    const bound = expandComposites([{ id: 'm', component: 'Mail', name: { '@path': '/n' }, email: { '@path': 'mail' } }]) as any[]
    expect(bound.find((c) => c.id === 'm__gruss').text).toEqual({ '@call': 'formatString', args: { value: 'Hallo ${/n} – kostet $5' } })
    expect(bound.find((c) => c.id === 'm__btn').action.functionCall.args.url).toEqual({ '@call': 'formatString', args: { value: 'mailto:${mail}' } })

    // ohne E-Mail entfällt der Knopf (statt eines leeren mailto:)
    const none = expandComposites([{ id: 'm', component: 'Mail', name: 'Ada' }]) as any[]
    expect(none.map((c) => c.id)).toEqual(['m', 'm__gruss', 'm__btnText'])
    expect(none[0].children).toEqual(['m__gruss'])

    // alles gültig für den Validator
    for (const inst of [{ name: 'Ada', email: 'ada@x.org' }, { name: { '@path': '/n' }, email: { '@path': '/e' } }, { name: 'Ada' }]) {
      const r = validate([], [{ createSurface: { surfaceId: 's', components: [{ id: 'root', component: 'Mail', ...inst }] } }])
      expect(r.errors, JSON.stringify(inst)).toEqual([])
    }
  })

  it('ContactCard-Beispiel: Knopf „E-Mail schreiben“ öffnet mailto mit der Adresse', () => {
    setComposites(loadComposites(exampleDir).defs)
    const out = expandComposites([{ id: 'k', component: 'ContactCard', name: 'Ada', email: 'ada@x.org' }]) as any[]
    expect(out.find((c) => c.id === 'k__mail').action.functionCall.args.url).toBe('mailto:ada@x.org')
    const ohne = expandComposites([{ id: 'k', component: 'ContactCard', name: 'Ada' }]) as any[]
    expect(ohne.some((c) => c.id === 'k__mail')).toBe(false)
  })
})
