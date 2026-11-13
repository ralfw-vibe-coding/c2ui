// E2E: Zwischenruf (Steer) aus der Warteschlange in eine laufende Claude-Antwort.
// 1) mitten im Turn (zwischen Werkzeugaufrufen) – Claude berücksichtigt ihn in derselben Antwort;
// 2) zu spät (während des Schlusstexts) – Claude beantwortet ihn danach von selbst, der Chat bleibt beschäftigt.
// Aufruf: npm run build && node scripts/steer-e2e.mjs [claude|codex] [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const agent = process.argv[2] ?? 'claude'
const out = resolve(process.argv[3] ?? join(root, `smoke-out/steer-${agent}`))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'bypassPermissions' } } }))
const log = (...a) => console.log(`[steer-${agent}]`, ...a)
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
const idle = () => page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 180_000 })

// 1) Mitten im Turn
await ta.fill(
  'Kettenaufgabe, strikt nacheinander (jeder Schritt braucht das Ergebnis des vorigen, nie parallel): ' +
    'Schritt 1: Shell `sleep 4; echo 10`. Schritt 2 bis 5: nimm die Zahl N aus der letzten Ausgabe und führe in der Shell ' +
    '`sleep 4; echo $((N*2))` mit eingesetzter Zahl aus. Am Ende nenne die letzte Zahl in einem Satz.'
)
await ta.press('Enter')
await cell.locator('.working').waitFor()
await ta.fill('Hör nach dem nächsten Schritt auf und beende deine Antwort mit dem Wort BANANE.')
await ta.press('Enter')
check((await cell.locator('.queue-steer').count()) === 1, 'Knopf „Zwischenruf“ an der eingereihten Nachricht')
await cell.locator('.queue-steer').click()
check((await cell.locator('.queue-item.steering').count()) === 1, 'Zwischenruf als „unterwegs“ angezeigt')
await page.screenshot({ path: join(out, '1-unterwegs.png') })
await cell.locator('.msg-user-col.steer').waitFor({ timeout: 60_000 }).catch(async (e) => {
  log('Fehler in der Warteschlange:', await cell.locator('.queue-error').innerText().catch(() => '–'))
  throw e
})
log('aufgenommen; noch beschäftigt:', (await cell.locator('.working').count()) === 1)
check((await cell.locator('.queue-item.steering').count()) === 0, '„unterwegs“ verschwindet bei Aufnahme')
await idle()
await page.waitForTimeout(500)
const users1 = await cell.locator('.msg-user').count()
const last1 = await cell.locator('.msg-assistant').last().innerText()
log('Antwort:', last1.slice(-160).replace(/\n/g, ' '))
check(/BANANE/i.test(last1), 'Agent hat den Zwischenruf befolgt (BANANE)')
const turns1 = await cell.locator('.turn-meta, .msg-turn-meta').count()
log('Nutzernachrichten:', users1, '| Turn-Zeilen:', turns1)
await page.screenshot({ path: join(out, '2-mitten.png') })

// 2) Zu spät: während des Schlusstexts
await ta.fill('Schreib eine Geschichte über einen Leuchtturmwärter, etwa 300 Wörter. Keine Werkzeuge.')
await ta.press('Enter')
await cell.locator('.working').waitFor()
await ta.fill('Antworte jetzt nur noch mit dem Wort KIWI.')
await ta.press('Enter')
await page.waitForTimeout(1500)
await cell.locator('.queue-steer').click()
await cell.locator('.msg-user-col.steer').nth(1).waitFor({ timeout: 120_000 })
await idle()
await page.waitForTimeout(500)
const last2 = await cell.locator('.msg-assistant').last().innerText()
log('letzte Antwort:', last2.slice(0, 120).replace(/\n/g, ' '))
check(/KIWI/i.test(last2), 'später Zwischenruf wird danach beantwortet (KIWI)')
check((await cell.locator('.queue').count()) === 0, 'nichts mehr in Warteschlange oder unterwegs')
const errs = await cell.locator('.msg-error, .error').allInnerTexts()
check(errs.length === 0, `keine Fehler im Verlauf ${errs.join(' | ')}`)
await page.screenshot({ path: join(out, '3-spaet.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
