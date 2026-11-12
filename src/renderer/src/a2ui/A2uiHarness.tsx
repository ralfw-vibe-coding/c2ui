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
        { id: 'col', component: 'Column', children: ['kpis', 'tbl', 'prog', 'alerts', 'badges', 'links', 'code', 'scatter', 'h', 'name', 'agree', 'size', 'rating', 'row', 'list', 'charts', 'pie', 'img', 'imgMissing'] },
        { id: 'kpis', component: 'Row', children: ['k1', 'k2', 'k3'] },
        { id: 'k1', component: 'Metric', weight: 1, label: 'Umsatz Q3', value: 1284500, format: 'currency', delta: 12.4, deltaLabel: 'ggü. Q2', trend: [8, 9, 8.5, 11, 12.8] },
        { id: 'k2', component: 'Metric', weight: 1, label: 'Kosten', value: 412300, format: 'currency', delta: 6.1, higherIsBetter: false, trend: [3, 3.2, 3.5, 4.1] },
        { id: 'k3', component: 'Metric', weight: 1, label: 'Antwortzeit', value: 1.8, unit: 'Std.', delta: -15, higherIsBetter: false },
        { id: 'tbl', component: 'Table', title: 'Offene Aufträge', data: { '@path': '/orders' }, selected: { '@path': '/auswahl' },
          action: { event: { name: 'auftrag', context: { zeile: { '@path': '/auswahl' } } } },
          columns: [{ key: 'nr', label: 'Nr.' }, { key: 'kunde', label: 'Kunde' }, { key: 'betrag', label: 'Betrag', format: 'currency' },
            { key: 'faellig', label: 'Fällig', format: 'date' }, { key: 'quote', label: 'Marge', format: 'percent' }] },
        { id: 'prog', component: 'Progress', label: 'Migration', value: 68, tone: 'accent' },
        { id: 'alerts', component: 'Column', children: ['al1', 'al2'] },
        { id: 'al1', component: 'Alert', tone: 'warning', title: 'Zwei Aufträge überfällig', text: 'Bitte **heute** nachfassen.' },
        { id: 'al2', component: 'Alert', tone: 'success', text: 'Import abgeschlossen: 1.204 Datensätze.' },
        { id: 'badges', component: 'Row', children: ['b1', 'b2', 'b3', 'b4'], justify: 'start' },
        { id: 'b1', component: 'Badge', text: 'offen', tone: 'info' },
        { id: 'b2', component: 'Badge', text: 'bezahlt', tone: 'success' },
        { id: 'b3', component: 'Badge', text: 'überfällig', tone: 'error' },
        { id: 'b4', component: 'Badge', text: 'v2.1' },
        { id: 'links', component: 'Row', children: ['l1', 'l2', 'l3', 'l4'] },
        { id: 'l1', component: 'Link', url: 'mailto:ada@example.org' },
        { id: 'l2', component: 'Link', url: 'tel:+4940123456', text: 'Anrufen' },
        { id: 'l3', component: 'Link', url: 'https://example.org/', variant: 'caption' },
        { id: 'l4', component: 'Link', url: 'file:///etc/hosts', text: 'Datei (gesperrt)' },
        { id: 'code', component: 'CodeBlock', title: 'umsatz.py', language: 'python',
          code: 'import pandas as pd\n\n# Umsatz je Monat\ndf = pd.read_csv("umsatz.csv")\nprint(df.groupby("monat")["betrag"].sum())  # 6 Zeilen' },
        { id: 'scatter', component: 'ScatterChart', title: 'Preis vs. Absatz', data: [
          { p: 9, a: 420, s: 'Basis' }, { p: 12, a: 380, s: 'Basis' }, { p: 15, a: 310, s: 'Basis' }, { p: 25, a: 190, s: 'Premium' }, { p: 29, a: 160, s: 'Premium' }, { p: 35, a: 120, s: 'Premium' } ],
          xKey: 'p', yKey: 'a', groupKey: 's', xLabel: 'Preis', xUnit: '€', yLabel: 'Absatz' },
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
        items: [{ label: 'Erster Eintrag' }, { label: 'Zweiter Eintrag' }],
        orders: [
          { nr: 'A-1001', kunde: 'Müller GmbH', betrag: 12500, faellig: '2026-11-20', quote: 18.5 },
          { nr: 'A-1002', kunde: 'Schmidt AG', betrag: 4300.5, faellig: '2026-11-05', quote: 22 },
          { nr: 'A-1003', kunde: 'Weber KG', betrag: 870, faellig: '2026-12-01', quote: 9.75 }
        ]
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
