// E2E: Während der Agent arbeitet, Nachrichten einreihen; sie gehen nacheinander raus.
// Nach Abbruch hält die Schlange an; Bearbeiten holt die Nachricht ins Eingabefeld zurück.
// Aufruf: npm run build && node scripts/queue-e2e.mjs [claude|codex] [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const agent = process.argv[2] ?? 'claude'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[3] ?? join(root, `smoke-out/queue-${agent}`))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'acceptEdits' } } }))
const log = (...a) => console.log(`[queue-${agent}]`, ...a)
let failed = false
const check = (ok, what) => {
  log(ok ? 'OK  ' : 'FEHLER', what)
  if (!ok) failed = true
}

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: agent === 'codex' ? 'Codex' : 'Claude' }).click()
const cell = page.locator('.cell').first()
const ta = cell.locator('.composer textarea')
const LONG = 'Schreib eine Geschichte über einen Leuchtturmwärter, etwa 400 Wörter. Keine Werkzeuge.'

// 1) Zwei Nachrichten einreihen, während die erste Antwort läuft.
await ta.fill(LONG)
await ta.press('Enter')
await cell.locator('.working').waitFor()
await ta.fill('Antworte nur mit dem Wort ZWEI.')
await ta.press('Enter')
await ta.fill('Antworte nur mit dem Wort DREI.')
await ta.press('Enter')
check((await cell.locator('.queue-item').count()) === 2, 'zwei Nachrichten eingereiht')
check((await ta.isEnabled()) && (await ta.inputValue()) === '', 'Eingabefeld frei und leer')
await page.screenshot({ path: join(out, '1-eingereiht.png') })

await cell.locator('.msg-turn').nth(2).waitFor({ timeout: 300_000 })
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 120_000 })
const users = await cell.locator('.msg-user').allInnerTexts()
log('Nutzernachrichten:', users.map((u) => u.slice(0, 30)))
check(users.length === 3 && /ZWEI/.test(users[1]) && /DREI/.test(users[2]), 'in Reihenfolge gesendet')
const answers = await cell.locator('.msg-assistant').allInnerTexts()
check(/ZWEI/i.test(answers.at(-2) ?? '') && /DREI/i.test(answers.at(-1) ?? ''), 'Antworten ZWEI und DREI')
check((await cell.locator('.queue').count()) === 0, 'Warteschlange leer')

// 2) Abbruch hält die Schlange an.
await ta.fill(LONG)
await ta.press('Enter')
await cell.locator('.working').waitFor()
await ta.fill('Antworte nur mit dem Wort VIER.')
await ta.press('Enter')
await cell.locator('.composer .btn.stop').click()
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 60_000 })
await page.waitForTimeout(1500)
check((await cell.locator('.queue.paused').count()) === 1, 'nach Abbruch angehalten')
check((await cell.locator('.queue-item').count()) === 1, 'Nachricht wartet noch')
log('Kopf:', await cell.locator('.queue-head').innerText())
await page.screenshot({ path: join(out, '2-angehalten.png') })

// 3) Bearbeiten holt sie ins Eingabefeld zurück; Senden geht direkt.
await cell.locator('.queue-item .icon-btn[title="Zurück ins Eingabefeld"]').click()
check((await ta.inputValue()) === 'Antworte nur mit dem Wort VIER.', 'Text zurück im Eingabefeld')
check((await cell.locator('.queue').count()) === 0, 'Warteschlange weg')
await ta.press('Enter')
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 120_000 })
await page.waitForTimeout(500)
check(/VIER/i.test((await cell.locator('.msg-assistant').last().innerText()) ?? ''), 'Antwort VIER')

// 4) Fortsetzen nach Abbruch.
await ta.fill(LONG)
await ta.press('Enter')
await cell.locator('.working').waitFor()
await ta.fill('Antworte nur mit dem Wort FÜNF.')
await ta.press('Enter')
await cell.locator('.composer .btn.stop').click()
await cell.locator('.queue.paused').waitFor({ timeout: 60_000 })
await cell.locator('.queue-resume').click()
await cell.locator('.working').waitFor()
await page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 120_000 })
await page.waitForTimeout(500)
check(/FÜNF/i.test(await cell.locator('.msg-assistant').last().innerText()), 'Fortsetzen sendet FÜNF')
await page.screenshot({ path: join(out, '3-ende.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
