// E2E: Kontextfüllstand im Zellenkopf (echte CLI, ein winziger Turn).
// Aufruf: npm run build && node scripts/context-e2e.mjs [claude|codex] [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const agent = process.argv[2] ?? 'claude'
const out = resolve(process.argv[3] ?? join(root, `smoke-out/context-${agent}`))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'bypassPermissions' } } }))
const log = (...a) => console.log(`[context-${agent}]`, ...a)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: agent === 'codex' ? 'Codex' : 'Claude' }).click()
const cell = page.locator('.cell').first()
check((await cell.locator('.context-gauge').count()) === 0, 'vor dem ersten Turn kein Füllstand')

const ta = cell.locator('.composer textarea')
await ta.fill('Antworte nur mit „ok“.')
await ta.press('Enter')
await cell.locator('.working').waitFor().catch(() => {})
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 180_000 })
await cell.locator('.context-gauge').waitFor({ timeout: 20_000 })
const gauge = await cell.locator('.context-gauge').innerText()
const title = await cell.locator('.context-gauge').getAttribute('title')
log('Anzeige:', gauge.replace(/\s+/g, ' '), '| Titel:', title?.replace(/\n/g, ' | '))
check(/\d/.test(gauge), 'Füllstand wird angezeigt')
check(/Kontext nach dem letzten Turn: [\d.]+ Tokens/.test(title ?? ''), 'Titel nennt die Tokenzahl')
const chat = await page.evaluate(async () => (await window.api.init()).chats[0])
log('gespeichert:', JSON.stringify(chat.context))
check(!!chat.context?.used, 'Füllstand steckt im Chat (übersteht Neustart)')
check(!!chat.context?.max, 'Fenstergröße bekannt')
const first = chat.context.used
await page.screenshot({ path: join(out, '1-fuellstand.png') })

// Zweiter Turn: der Kontext wächst
await ta.fill('Zähle von 1 bis 20, nur die Zahlen.')
await ta.press('Enter')
await cell.locator('.working').waitFor().catch(() => {})
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 180_000 })
await page.waitForTimeout(800)
const second = (await page.evaluate(async () => (await window.api.init()).chats[0])).context.used
log('Tokens:', first, '→', second)
check(second > first, 'Füllstand wächst mit dem Gespräch')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
