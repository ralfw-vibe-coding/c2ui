// E2E: Anhänge per Einfügen (Bild) und Drag&Drop (Textdatei) mit echter Claude- und Codex-CLI.
// Aufruf: npm run build && node scripts/attachments-e2e.mjs <bild.png>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/attachments')
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku' } } }))
const png = readFileSync(resolve(process.argv[2])).toString('base64')
const log = (...a) => console.log('[anhang]', ...a)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)

async function attach(cell) {
  // Bild per Einfügen
  await cell.locator('textarea').evaluate((ta, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }))
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, png)
  // Textdatei per Drag&Drop auf den Chat
  await cell.locator('.chat-panel').evaluate((el) => {
    const dt = new DataTransfer()
    dt.items.add(new File(['Die Losung lautet: Pfefferminze-42.'], 'notiz.txt', { type: 'text/plain' }))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await cell.locator('.attach-chip').nth(1).waitFor({ timeout: 10_000 })
  log('Anhänge vor dem Senden:', (await cell.locator('.attach-chip .attach-name').allInnerTexts()).join(', '))
}

for (const agent of ['Claude', 'Codex']) {
  await page.locator('.cell').first().locator('[title="Rechts teilen"]').click().catch(() => {})
  const empty = page.locator('.cell', { has: page.locator('.empty-cell') }).first()
  await empty.locator('.new-chat-big', { hasText: agent }).click()
  const cell = page.locator('.cell').filter({ has: page.locator('.cell-title-text', { hasText: 'Neuer Chat' }) }).first()
  await cell.waitFor()
  const id = await cell.getAttribute('data-cell-id')
  const c = page.locator(`[data-cell-id="${id}"]`)
  await attach(c)
  await c.locator('textarea').fill('Was zeigt das Bild (Form und Farbe), und wie lautet die Losung in der Textdatei? Kurz.')
  await c.locator('textarea').press('Enter')
  await c.locator('.msg-turn').first().waitFor({ timeout: 400_000 })
  log(agent, '– gesendete Anhänge:', await c.locator('.sent-image').count(), 'Bild(er),', await c.locator('.attach-chip.sent').count(), 'Datei(en)')
  log(agent, '– Antwort:', (await c.locator('.msg-assistant').last().innerText()).replace(/\s+/g, ' ').slice(0, 200))
}
await page.screenshot({ path: join(out, 'anhaenge.png') })
await app.close()
