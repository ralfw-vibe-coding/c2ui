// Prüfung ohne Modellaufruf: bestehende Claude-Session als Chat übernehmen.
// Legt in einem Schein-Home zwei Session-Logs an, übernimmt eine davon und prüft Chat, Hinweis und Doppelvergabe.
// Aufruf: npm run build && node scripts/adopt-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/adopt'))
const userData = join(out, 'userdata')
const home = join(out, 'home')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
const slug = work.replace(/[^a-zA-Z0-9]/g, '-')
const sessions = join(home, '.claude', 'projects', slug)
mkdirSync(sessions, { recursive: true })
const log = (text) => JSON.stringify({ type: 'user', isSidechain: false, message: { role: 'user', content: text } }) + '\n'
writeFileSync(join(sessions, '11111111-1111-4111-8111-111111111111.jsonl'), log('Älteres Gespräch über Gliederungen'))
writeFileSync(join(sessions, '22222222-2222-4222-8222-222222222222.jsonl'), log('Neueres Gespräch über Quellen'))
const say = (...x) => console.log('[adopt]', ...x)
let failed = false
const check = (ok, what) => { say(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, HOME: home, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)

await page.locator('.adopt-btn').click()
await page.locator('.adopt-dialog').waitFor()
await page.locator('.adopt-dialog .btn', { hasText: 'Ordner wählen' }).click()
await page.locator('.adopt-item').first().waitFor()
const items = await page.locator('.adopt-item').allInnerTexts()
say('Liste:', items.map((t) => t.replace(/\s+/g, ' ')))
check(items.length === 2 && /Neueres Gespräch/.test(items[0]), 'beide Sessions, neueste zuerst')
await page.screenshot({ path: join(out, '1-liste.png') })

await page.locator('.adopt-item').first().click()
await page.locator('.chat-panel').waitFor()
check((await page.locator('.adopt-dialog').count()) === 0, 'Dialog schließt nach der Übernahme')
const chats = await page.evaluate(async () => (await window.api.init()).chats)
say('Chat:', JSON.stringify(chats.map((c) => ({ t: c.title, s: c.sessionId, started: c.sessionStarted, cwd: c.cwd.slice(-7) }))))
check(chats.length === 1 && chats[0].sessionId === '22222222-2222-4222-8222-222222222222' && chats[0].sessionStarted === true, 'Chat setzt genau diese Session fort')
check(chats[0].title === 'Neueres Gespräch über Quellen' && chats[0].cwd === work, 'Titel aus der ersten Nachricht, Ordner übernommen')
check((await page.locator('.msg-notice').count()) === 1 && /Übernommene Session/.test(await page.locator('.msg-notice').first().innerText()), 'genau ein Hinweis im Chat')
await page.screenshot({ path: join(out, '2-chat.png') })

// Dieselbe Session nicht zweimal
await page.locator('.adopt-btn').click()
await page.locator('.adopt-item').first().waitFor()
await page.locator('.adopt-item').first().click()
await page.locator('.merge-error').waitFor({ timeout: 5000 })
const err = await page.locator('.merge-error').innerText()
say('Fehler:', err)
check(/läuft schon/.test(err), 'dieselbe Session wird nicht doppelt übernommen')
check((await page.evaluate(async () => (await window.api.init()).chats)).length === 1, 'kein zweiter Chat angelegt')
await page.locator('.adopt-dialog .btn', { hasText: 'Schließen' }).click()

// Übersteht einen Neustart
await page.waitForTimeout(600)
await page.reload()
await page.locator('.chat-panel').waitFor()
check((await page.locator('.msg-notice').count()) === 1, 'Hinweis nach Neuladen noch da')

await app.close()
say(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
