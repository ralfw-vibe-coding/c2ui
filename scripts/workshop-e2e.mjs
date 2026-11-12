// E2E: Komponenten-Werkstatt mit echter Claude CLI (sonnet) – Komponente per Chat ändern, Vorschau live.
// Aufruf: npm run build && node scripts/workshop-e2e.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/workshop')
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'sonnet' } } }))
const log = (...a) => console.log('[werkstatt]', ...a)
const compFile = join(userData, 'components/ContactCard/component.json')

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
log('Ordner angelegt, ANLEITUNG.md:', readFileSync(join(userData, 'components/ANLEITUNG.md'), 'utf8').split('\n')[0])

await page.locator('[title=Einstellungen]').click()
await page.locator('.components-list li', { hasText: 'ContactCard' }).getByText('Mit Claude bearbeiten').click()
const cell = page.locator('.cell', { has: page.locator('.cell-title-text', { hasText: 'Werkstatt' }) })
await cell.waitFor()
log('Chat:', await cell.locator('.cell-title-text').innerText(), '| Verzeichnis:', await cell.locator('.cell-cwd').innerText())
log('Eingabefeld vorbelegt:', JSON.stringify(await cell.locator('textarea').inputValue()))

const waitTurn = (n) => cell.locator('.msg-turn').nth(n).waitFor({ timeout: 400_000 })
await cell.locator('textarea').press('End')
await cell.locator('textarea').pressSequentially('Zeig mir erst einmal eine Vorschau, so wie sie jetzt ist.')
await cell.locator('textarea').press('Enter')
await waitTurn(0)
log('Screens nach Vorschau:', await cell.locator('.a2ui-frame').count(), '| Karten-Namen:', (await cell.locator('.a2ui-frame').first().innerText()).replace(/\s+/g, ' ').slice(0, 140))
await page.screenshot({ path: join(out, '1-vorschau.png') })
const before = readFileSync(compFile, 'utf8')

await cell.locator('textarea').fill('Ändere ContactCard: Das Badge soll links vor dem Namen stehen, und unter der E-Mail soll optional eine Telefonnummer (Eigenschaft phone) erscheinen. Ergänze phone im Beispiel.')
await cell.locator('textarea').press('Enter')
await waitTurn(1)
const after = readFileSync(compFile, 'utf8')
log('component.json geändert:', before !== after, '| enthält phone:', after.includes('"phone"'))
log('Screens danach:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
const first = cell.locator('.a2ui-frame').first()
log('Vorschau jetzt:', (await first.innerText()).replace(/\s+/g, ' ').slice(0, 200))
log('Einklappzeilen:', (await cell.locator('.steps-head').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || ').slice(0, 300))
await first.scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, '2-geaendert.png') })
await app.close()
