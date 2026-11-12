// E2E: eigene Komponente (ContactCard aus den Beispielen) mit echter Claude CLI (sonnet).
// Aufruf: npm run build && node scripts/a2ui-components-e2e.mjs
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/a2ui-components')
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'sonnet' } } }))
const log = (...a) => console.log('[comp]', ...a)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
const cell = page.locator('.cell').first()
await cell.locator('textarea').fill(
  'Zeig mir unser Team als Oberfläche: Ada Lovelace (CTO, ada@example.org, aktiv), Grace Hopper (Entwicklung, grace@example.org, im Urlaub), Alan Turing (Forschung, alan@example.org).'
)
await cell.locator('textarea').press('Enter')
await cell.locator('.msg-turn').first().waitFor({ timeout: 300_000 })
const tools = (await cell.locator('.tool .tool-name').allInnerTexts()).join(', ')
log('Tools:', tools)
const tdir = join(userData, 'transcripts')
const t = JSON.parse(readFileSync(join(tdir, readdirSync(tdir)[0]), 'utf8'))
const calls = t.flatMap((i) => (i.blocks ?? []).filter((b) => b.type === 'tool_use' && b.name.includes('render_ui')))
  .flatMap((b) => b.input.messages.flatMap((m) => (m.createSurface ?? m.updateComponents ?? {}).components ?? []).map((c) => `${c.id}:${c.component}`))
log('Komponenten:', calls.join(', '))
const frame = cell.locator('.a2ui-frame').first()
log('Screens:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count(), '| Badges:', (await frame.locator('.c2-badge').allInnerTexts()).join(', '))
await page.screenshot({ path: join(out, 'team.png') })
await page.locator('[title=Einstellungen]').click()
log('Einstellungen:', (await page.locator('.components-head').innerText()).replace(/\s+/g, ' '))
await app.close()
