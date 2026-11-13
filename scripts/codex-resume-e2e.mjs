// E2E: Codex-Chat über einen Neustart der App fortsetzen (thread/resume in neuem app-server).
// Aufruf: npm run build && node scripts/codex-resume-e2e.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/codex-resume'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({}))
const log = (...a) => console.log('[codex-resume]', ...a)

async function launch() {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
  const page = await app.firstWindow()
  await page.waitForSelector('.app')
  return { app, page }
}
const idle = (page) => page.waitForFunction(() => document.querySelector('.cell .msg-turn') && !document.querySelector('.cell .working'), null, { timeout: 180_000 })

let { app, page } = await launch()
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: 'Codex' }).click()
let ta = page.locator('.cell').first().locator('.composer textarea')
await ta.fill('Das Codewort ist Mandarine. Merk es dir, antworte nur mit OK.')
await ta.press('Enter')
await idle(page)
await page.waitForTimeout(500)
log('Antwort 1:', (await page.locator('.cell .msg-assistant').last().innerText()).slice(0, 60))
await app.close()

;({ app, page } = await launch())
await page.locator('.cell .msg-turn').first().waitFor()
ta = page.locator('.cell').first().locator('.composer textarea')
await ta.fill('Wie lautet das Codewort? Nur das Wort.')
await ta.press('Enter')
await page.locator('.cell .msg-turn').nth(1).waitFor({ timeout: 180_000 })
await idle(page)
await page.waitForTimeout(500)
const ans = await page.locator('.cell .msg-assistant').last().innerText()
const notices = await page.locator('.cell .msg-notice, .cell .notice').allInnerTexts()
log('Antwort 2:', ans.slice(0, 60), '| Hinweise:', notices.length)
const ok = /mandarine/i.test(ans) && notices.length === 0
log(ok ? 'alles OK' : 'FEHLGESCHLAGEN')
await app.close()
process.exit(ok ? 0 : 1)
