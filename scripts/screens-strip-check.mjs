// Prüft die Screen-Übersicht ohne Modellaufruf: legt einen gespeicherten Chat mit mehreren
// A2UI-Screens an und lädt ihn in die App. Aufruf: npm run build && node scripts/screens-strip-check.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/screens')
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const CAT = 'https://claude2ui.local/catalogs/v1/catalog.json'
const surface = (id, components, dataModel = {}) => ({ version: '1.0', createSurface: { surfaceId: id, catalogId: CAT, components, dataModel } })
const screens = [
  surface('anmeldung', [
    { id: 'root', component: 'Card', child: 'c' },
    { id: 'c', component: 'Column', children: ['t', 'n', 'b'] },
    { id: 't', component: 'Text', text: '## Anmeldung' },
    { id: 'n', component: 'TextField', label: 'Name', value: { '@path': '/name' } },
    { id: 'bt', component: 'Text', text: 'Senden' },
    { id: 'b', component: 'Button', variant: 'primary', child: 'bt', action: { event: { name: 'senden' } } }
  ]),
  surface('umsatz', [
    { id: 'root', component: 'LineChart', title: 'Umsatz', data: { '@path': '/d' }, xKey: 'm', area: true, series: [{ key: 'u' }] }
  ], { d: [{ m: 'Jan', u: 3 }, { m: 'Feb', u: 5 }, { m: 'Mär', u: 4 }, { m: 'Apr', u: 8 }] }),
  surface('kennzahlen', [
    { id: 'root', component: 'Row', children: ['a', 'b'] },
    { id: 'a', component: 'Metric', weight: 1, label: 'Kunden', value: 1284, delta: 4.2 },
    { id: 'b', component: 'Metric', weight: 1, label: 'Churn', value: 2.1, format: 'percent', delta: -0.4, higherIsBetter: false }
  ]),
  surface('auftraege', [
    { id: 'root', component: 'Table', title: 'Aufträge', data: { '@path': '/r' }, columns: [{ key: 'k', label: 'Kunde' }, { key: 'b', label: 'Betrag', format: 'currency' }] }
  ], { r: [{ k: 'Müller', b: 1200 }, { k: 'Schmidt', b: 830 }, { k: 'Weber', b: 2400 }] })
]

const chatId = 'chat-screens'
const t = []
screens.forEach((m, i) => {
  t.push({ type: 'user', id: `u${i}`, text: `Screen ${i + 1} bitte`, ts: Date.now() })
  t.push({
    type: 'assistant',
    id: `a${i}`,
    blocks: [
      { type: 'tool_use', id: `t${i}`, name: 'mcp__a2ui__render_ui', input: { messages: [m] }, result: { content: 'OK', isError: false } },
      { type: 'text', text: 'Hier ist der Screen. '.repeat(1) + 'Etwas Text danach, damit gescrollt werden muss.\n\n'.repeat(4) }
    ]
  })
  t.push({ type: 'turn', id: `r${i}`, durationMs: 1000, isError: false })
})
const now = Date.now()
writeFileSync(join(userData, 'transcripts', `${chatId}.json`), JSON.stringify(t))
writeFileSync(
  join(userData, 'chats.json'),
  JSON.stringify([{ id: chatId, title: 'Vier Screens', cwd: out, agent: 'claude', permissionMode: 'acceptEdits', model: '', sessionId: 'x', sessionStarted: false, createdAt: now, updatedAt: now }])
)
writeFileSync(join(userData, 'layout.json'), JSON.stringify({ root: { type: 'leaf', id: 'cell-1', chatId }, selectedCellId: 'cell-1' }))

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.screen-thumb')
await page.waitForTimeout(800)
const marked = async () => (await page.locator('.screen-thumb.active .screen-thumb-label').allInnerTexts()).join(', ')
console.log('Miniaturen:', (await page.locator('.screen-thumb-label').allInnerTexts()).join(', '))
console.log('markiert (unten):', await marked())
await page.screenshot({ path: join(out, '1-leiste.png') })
await page.locator('.screen-thumb', { hasText: 'Anmeldung' }).click()
await page.waitForTimeout(900)
console.log('markiert nach Klick auf Anmeldung:', await marked())
await page.screenshot({ path: join(out, '2-sprung.png') })
await page.locator('.screen-strip-toggle').click()
console.log('eingeklappt – Miniaturen sichtbar:', await page.locator('.screen-thumb').count())
await app.close()
