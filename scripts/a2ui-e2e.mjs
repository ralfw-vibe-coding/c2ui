// E2E-Test A2UI mit echter Claude CLI (Modell sonnet).
// Aufruf: npm run build && node scripts/a2ui-e2e.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/a2ui'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'sonnet', defaultMode: 'acceptEdits' } } }))

const log = (...a) => console.log('[a2ui]', ...a)

async function launch() {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
  const page = await app.firstWindow()
  await page.waitForSelector('.app')
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, work)
  return { app, page }
}

async function send(cell, text) {
  const turns = await cell.locator('.msg-turn').count()
  await cell.locator('textarea').fill(text)
  await cell.locator('textarea').press('Enter')
  await cell.locator('.msg-turn').nth(turns).waitFor({ timeout: 240_000 })
}

let { app, page } = await launch()
await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
const cell = page.locator('.cell').first()

// 1) Formular anfordern
await send(
  cell,
  'Zeig mir bitte als Oberfläche ein Formular zur Tischreservierung: Name (Textfeld), Anzahl Personen (Slider 1–8), ' +
    'Terrasse ja/nein (Checkbox) und einen Button „Reservieren“. Wenn ich auf Reservieren klicke, ' +
    'zeig im selben Screen eine Bestätigung mit meinen Angaben an.'
)
log('Screens:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
log('Text nach Screen:', (await cell.locator('.msg-assistant .md').allInnerTexts()).join(' / ').slice(0, 200))
await page.screenshot({ path: join(out, '1-formular.png') })

// 2) Eingeben und absenden
const frame = cell.locator('.a2ui-frame').first()
await frame.locator('input:not([type=range]):not([type=checkbox])').first().fill('Ralf')
await frame.locator('input[type=checkbox]').first().check().catch(() => frame.getByText(/Terrasse/i).first().click())
await frame.getByText('Reservieren', { exact: false }).last().click()
await cell.locator('.a2ui-action').first().waitFor({ timeout: 10_000 })
log('Aktion gesendet:', await cell.locator('.a2ui-action summary').first().innerText())
await cell.locator('.msg-turn').nth(1).waitFor({ timeout: 240_000 })
log('Updates:', await cell.locator('button.a2ui-update').count(), '| Screens:', await cell.locator('.a2ui-frame').count())
log('Screen-Inhalt:', (await frame.innerText()).replace(/\s+/g, ' ').slice(0, 300))
await page.screenshot({ path: join(out, '2-nach-aktion.png') })

// 3) Normale Textfrage – Antwort erscheint unter dem Screen
await send(cell, 'Danke! Antworte jetzt bitte ganz normal mit Text: Wie viele Personen hatte ich angegeben?')
log('Textantwort:', (await cell.locator('.msg-assistant').last().innerText()).replace(/\s+/g, ' ').slice(0, 200))
await page.screenshot({ path: join(out, '3-text.png') })
await app.close()

// 4) Neustart – Screen wird aus dem eigenen Transkript wiederhergestellt
;({ app, page } = await launch())
await page.waitForSelector('.a2ui-frame', { timeout: 10_000 })
log('Nach Neustart – Screens:', await page.locator('.a2ui-frame').count())
log('Inhalt:', (await page.locator('.a2ui-frame').first().innerText()).replace(/\s+/g, ' ').slice(0, 200))
await page.screenshot({ path: join(out, '4-neustart.png') })
await app.close()
log('fertig')
