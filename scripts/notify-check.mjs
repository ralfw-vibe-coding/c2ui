// Prüfung ohne Modellaufruf: Einstellungen der Benachrichtigungen und Klick auf eine Meldung.
// (Ob macOS die Meldung zeigt, prüft das Skript nicht – die Entscheidungslogik deckt notifications.test.ts ab.)
// Aufruf: npm run build && node scripts/notify-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/notify'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const base = { cwd: root, permissionMode: 'default', sessionStarted: false, agent: 'claude' }
const chats = [
  { ...base, id: 'eins', title: 'Erster Chat', sessionId: 'eins', createdAt: 1, updatedAt: 2 },
  { ...base, id: 'zwei', title: 'Zweiter Chat', sessionId: 'zwei', createdAt: 3, updatedAt: 4 }
]
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
for (const id of ['eins', 'zwei']) {
  writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify([{ type: 'user', id: `${id}-1`, ts: 1, text: `Nachricht in ${id}` }]))
}
const log = (...x) => console.log('[notify]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

// Attrappe einer CLI, die stillschweigend nichts tut (für den hängenden Turn)
const fake = join(out, 'stille-cli.sh')
writeFileSync(fake, '#!/bin/sh\ncat > /dev/null &\nsleep 600\n', { mode: 0o755 })

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData, C2UI_FAKE_CLI: fake } })
// Der Hauptprozess schreibt jede Meldung als Zeile „[notify] Titel – Text“.
const seen = []
app.process().stdout.on('data', (d) => {
  for (const line of String(d).split('\n')) {
    const m = /^\[notify\] (.+?) – (.+)$/.exec(line.trim())
    if (m) seen.push({ title: m[1], body: m[2] })
  }
})
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')

// Einstellungen: Voreinstellung, ändern, speichern
await page.locator('.icon-btn', { hasText: 'Einstellungen' }).click()
const section = page.locator('.agent-settings', { hasText: 'Benachrichtigungen' })
await section.waitFor()
const boxes = section.locator('.check-row input')
check((await boxes.nth(0).isChecked()) && (await boxes.nth(1).isChecked()), 'beide Hinweise sind voreingestellt an')
check((await section.locator('.notify-minutes input').inputValue()) === '3', 'Voreinstellung: 3 Minuten Stille')
await boxes.nth(0).uncheck()
await section.locator('.notify-minutes input').fill('7')
await page.screenshot({ path: join(out, '1-einstellungen.png') })
await page.locator('.modal-actions .btn.primary', { hasText: 'Speichern' }).click()
await page.waitForTimeout(400)
const saved = await page.evaluate(async () => (await window.api.init()).settings.notifications)
log('gespeichert:', JSON.stringify(saved))
check(saved.done === false && saved.stalled === true && saved.stalledMinutes === 7, 'Einstellungen gespeichert')

// Überstehen den Neustart
await page.reload()
await page.waitForSelector('.chat-item')
await page.locator('.icon-btn', { hasText: 'Einstellungen' }).click()
const section2 = page.locator('.agent-settings', { hasText: 'Benachrichtigungen' })
await section2.waitFor()
check((await section2.locator('.notify-minutes input').inputValue()) === '7', 'Einstellung übersteht den Neustart')
await page.locator('.modal-actions .btn', { hasText: 'Abbrechen' }).click()

// Klick auf eine Meldung: der Chat kommt nach vorn
const open = () => page.evaluate(() => document.querySelector('.chat-panel')?.getAttribute('data-chat-id') ?? null)
await page.locator('.chat-item', { hasText: 'Erster Chat' }).click()
await page.locator('.chat-panel').waitFor()
check((await open()) === 'eins', 'erster Chat offen')
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('notify:open', 'zwei'))
await page.waitForTimeout(500)
log('nach dem Klick offen:', await open())
check((await open()) === 'zwei', 'Klick auf die Meldung zeigt den gemeldeten Chat')

// Hängender Turn: eine Attrappen-CLI, die nie antwortet – nach einer Minute Stille kommt der Hinweis.
await page.locator('.chat-item', { hasText: 'Zweiter Chat' }).click()
await page.locator('.chat-panel').waitFor()
await page.evaluate(async (cli) => {
  const s = (await window.api.init()).settings
  await window.api.setSettings({
    notifications: { done: false, stalled: true, stalledMinutes: 1 },
    agents: { ...s.agents, claude: { ...s.agents.claude, path: cli } }
  })
}, fake)
// Gemeldet wird nur, was man nicht sieht: Fenster in den Hintergrund schicken.
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur())
const ta = page.locator('.cell .composer textarea').first()
await ta.fill('Diese Antwort kommt nie.')
await ta.press('Enter')
await page.locator('.cell .working').waitFor({ timeout: 10_000 })
log('Turn läuft, warte auf den Hinweis (gut eine Minute) …')
const start = Date.now()
while (Date.now() - start < 140_000 && !seen.some((n) => /^Keine Regung/.test(n.title))) await page.waitForTimeout(2000)
log('Meldungen:', JSON.stringify(seen))
check(seen.filter((n) => /^Keine Regung/.test(n.title)).length === 1, 'genau ein Hinweis auf den hängenden Chat')
check(/Seit 1 Minute\b/.test(seen.find((n) => /^Keine Regung/.test(n.title))?.body ?? ''), 'Hinweis nennt die Dauer')
await page.screenshot({ path: join(out, '2-haengt.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
