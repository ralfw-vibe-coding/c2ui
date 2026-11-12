import { useEffect, useState } from 'react'
import { A2uiSurface } from '@a2ui/react/v0_9'
import { basicCatalog, injectBasicCatalogStyles, MessageProcessor } from '@a2ui/web_core/v1_0'
import { buildClaude2uiCatalog, CLAUDE2UI_CATALOG_ID } from '@shared/a2ui-catalog'
import { A2uiChatContext, COMPONENT_IMPLS } from './components'

// Entwicklungs-Testansicht (#a2ui-test): rendert eine Beispiel-Surface aus v1.0-Nachrichten.

const CAT = CLAUDE2UI_CATALOG_ID
const sample = [
  { version: '1.0', createSurface: { surfaceId: 'demo', catalogId: CAT } },
  {
    version: '1.0',
    updateComponents: {
      surfaceId: 'demo',
      components: [
        { id: 'root', component: 'Card', child: 'col' },
        { id: 'col', component: 'Column', children: ['h', 'name', 'agree', 'size', 'rating', 'row', 'list', 'charts', 'pie', 'img', 'imgMissing'] },
        { id: 'charts', component: 'Row', children: ['line', 'bar'] },
        { id: 'line', component: 'LineChart', weight: 1, title: 'Umsatz & Kosten', data: { '@path': '/sales' }, xKey: 'monat', unit: '€', area: true,
          series: [{ key: 'umsatz', label: 'Umsatz' }, { key: 'kosten', label: 'Kosten' }] },
        { id: 'bar', component: 'BarChart', weight: 1, title: 'Tickets je Team', data: { '@path': '/teams' }, xKey: 'team', stacked: true,
          series: [{ key: 'offen', label: 'Offen' }, { key: 'erledigt', label: 'Erledigt' }] },
        { id: 'pie', component: 'PieChart', title: 'Marktanteile', donut: true, unit: '%', data: [
          { label: 'Alpha', value: 42 }, { label: 'Beta', value: 27 }, { label: 'Gamma', value: 18 }, { label: 'Rest', value: 13 } ] },
        { id: 'img', component: 'Image', url: 'resources/icon.png', variant: 'smallFeature', description: 'App-Icon (lokal, relativ)' },
        { id: 'imgMissing', component: 'Image', url: '/gibt/es/nicht.png' },
        { id: 'h', component: 'Text', text: '## Bestellung\nBitte **ausfüllen**.' },
        { id: 'name', component: 'TextField', label: 'Name', value: { '@path': '/form/name' } },
        { id: 'agree', component: 'CheckBox', label: 'AGB akzeptiert', value: { '@path': '/form/agree' } },
        {
          id: 'size',
          component: 'ChoicePicker',
          label: 'Größe',
          options: [
            { label: 'S', value: 's' },
            { label: 'M', value: 'm' },
            { label: 'L', value: 'l' }
          ],
          value: { '@path': '/form/size' },
          displayStyle: 'chips'
        },
        { id: 'rating', component: 'Slider', label: 'Bewertung', min: 0, max: 10, value: { '@path': '/form/rating' } },
        { id: 'row', component: 'Row', children: ['ok', 'cancel'], justify: 'end' },
        { id: 'okText', component: 'Text', text: 'Absenden' },
        {
          id: 'ok',
          component: 'Button',
          variant: 'primary',
          child: 'okText',
          action: { event: { name: 'submit', context: { form: { '@path': '/form' } } } }
        },
        { id: 'cancelText', component: 'Text', text: 'Abbrechen' },
        { id: 'cancel', component: 'Button', child: 'cancelText', action: { event: { name: 'cancel' } } },
        { id: 'list', component: 'List', children: { path: '/items', componentId: 'item' } },
        { id: 'item', component: 'Text', text: { '@path': 'label' } }
      ]
    }
  },
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: 'demo',
      path: '/',
      value: {
        form: { name: 'Ralf', agree: false, size: ['m'], rating: 7 },
        sales: [
          { monat: 'Jan', umsatz: 120, kosten: 80 }, { monat: 'Feb', umsatz: 135, kosten: 82 }, { monat: 'Mär', umsatz: 160, kosten: 95 },
          { monat: 'Apr', umsatz: 150, kosten: 99 }, { monat: 'Mai', umsatz: 190, kosten: 105 }, { monat: 'Jun', umsatz: 210, kosten: 112 }
        ],
        teams: [{ team: 'Web', offen: 12, erledigt: 30 }, { team: 'App', offen: 8, erledigt: 22 }, { team: 'Backend', offen: 15, erledigt: 41 }],
        items: [{ label: 'Erster Eintrag' }, { label: 'Zweiter Eintrag' }]
      }
    }
  }
]

export function A2uiHarness() {
  const [log, setLog] = useState<string[]>([])
  const [processor] = useState(() => {
    injectBasicCatalogStyles()
    return new MessageProcessor(
      [buildClaude2uiCatalog(COMPONENT_IMPLS as never), basicCatalog] as never,
      (a) => setLog((l) => [...l, 'Aktion: ' + JSON.stringify(a)]),
      { errorHandler: (e) => setLog((l) => [...l, 'Fehler: ' + JSON.stringify(e)]) }
    )
  })
  const [surfaces, setSurfaces] = useState(() => [...processor.model.surfacesMap.values()])

  useEffect(() => {
    try {
      processor.processMessages(sample as never)
    } catch (e) {
      setLog((l) => [...l, 'Throw: ' + (e as Error).message])
    }
    setSurfaces([...processor.model.surfacesMap.values()])
  }, [processor])

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
      <A2uiChatContext.Provider value={{ cwd: sessionStorage.getItem('cwd') ?? '', home: '' }}>
        {surfaces.map((s) => (
          <A2uiSurface key={s.id} surface={s as never} />
        ))}
      </A2uiChatContext.Provider>
      <pre id="a2ui-log" style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
        {log.join('\n')}
      </pre>
    </div>
  )
}
