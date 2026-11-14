// E2E: Benachrichtigung „fertig“ mit echter CLI. Geprüft wird die Zeile, die der Hauptprozess zu jeder
// Meldung schreibt (die Systemmeldung selbst lässt sich von außen nicht abfragen).
// Aufruf: npm run build && node scripts/notify-e2e.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/notify-e2e'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'bypassPermissions' } } }))
const log = (...a) => console.log('[notify-e2e]', ...a)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
// Der Hauptprozess schreibt jede Meldung als Zeile „[notify] Titel – Text“; die lesen wir mit.
const seen = []
app.process().stdout.on('data', (d) => {
  for (const line of String(d).split('\n')) {
    const m = /^\[notify\] (.+?) – (.+)$/.exec(line.trim())
    if (m) seen.push({ title: m[1], body: m[2] })
  }
})
const notes = async () => seen
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)

await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
const cell = page.locator('.cell').first()
const ta = cell.locator('.composer textarea')
const idle = () => page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 180_000 })

// Das Fenster hält im Test keinen Fokus (der Terminal-Prozess holt ihn zurück), deshalb prüft dieses
// Skript die Fälle „Hintergrund“ und „abgeschaltet“; dass ein sichtbarer Chat im Vordergrund nichts
// meldet, deckt notifications.test.ts ab (shouldNotify).
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur())

// 1) Turn im Hintergrund: Meldung „Fertig“
await ta.fill('Antworte nur mit „eins“.')
await ta.press('Enter')
await cell.locator('.working').waitFor().catch(() => {})
await idle()
await page.waitForTimeout(600)
const fertig = await notes()
log('Meldungen:', JSON.stringify(fertig.map((n) => n.title)))
check(fertig.length === 1 && /^Fertig: /.test(fertig[0].title), 'Hinweis, wenn ein Turn im Hintergrund fertig ist')

// 2) Abgeschaltet: keine Meldung mehr
await page.evaluate(async () => {
  const s = (await window.api.init()).settings
  await window.api.setSettings({ notifications: { ...s.notifications, done: false, stalled: true, stalledMinutes: 1 } })
})
await ta.fill('Antworte nur mit „zwei“.')
await ta.press('Enter')
await cell.locator('.working').waitFor().catch(() => {})
await idle()
await page.waitForTimeout(600)
check((await notes()).length === 1, 'abgeschaltet kommt kein „Fertig“ mehr')

// Der hängende Fall steckt in notify-check.mjs (Attrappen-CLI, die nie antwortet).

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
