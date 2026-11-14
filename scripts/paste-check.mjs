// Prüfung ohne Modellaufruf: Große Einfügungen werden zum Anhang statt ins Eingabefeld zu wandern.
// Eingefügt wird über die echte Zwischenablage mit ⌘V.
// Aufruf: npm run build && node scripts/paste-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/paste'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'transcripts', 'eins.json'), JSON.stringify([{ type: 'user', id: 'u1', ts: 1, text: 'Hallo' }]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'eins', title: 'Ein Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'eins', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))

const kurz = 'Bitte schau dir das an:\nZeile zwei\nZeile drei'
const lang = Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1}: etwas Text aus einem Protokoll`).join('\n')
const eineLangeZeile = 'x'.repeat(2500)

const log = (...x) => console.log('[einfügen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()
const feld = page.locator('.cell .composer textarea').first()
const einfuegen = async (text) => {
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
  await feld.click()
  await page.keyboard.press('Meta+v')
  await page.waitForTimeout(400)
}

// Kurzes bleibt im Feld
await einfuegen(kurz)
check((await feld.inputValue()) === kurz, 'kurzer Text bleibt im Eingabefeld')
check((await page.locator('.attach-chip').count()) === 0, 'und wird nicht angehängt')
await feld.fill('')

// Vierzig Zeilen: Anhang statt Feld
await einfuegen(lang)
check((await feld.inputValue()) === '', 'langer Text landet nicht im Feld')
const chip = page.locator('.composer .attach-chip')
check((await chip.count()) === 1, 'er hängt als Datei daneben')
log('Chip:', (await chip.innerText()).replace(/\s+/g, ' '))
const hinweis = await page.locator('.composer-note').innerText()
log('Hinweis:', hinweis.replace(/\s+/g, ' '))
check(/40 Zeilen/.test(hinweis) && /Zeile 1:/.test(hinweis), 'der Hinweis sagt Umfang und Anfang')
// Die Datei enthält wirklich den Text
const pfad = join(userData, 'attachments', 'eins')
const inhalt = readFileSync(join(pfad, 'einfuegung.txt'), 'utf8')
check(inhalt === lang, 'die Datei enthält genau den eingefügten Text')
await page.screenshot({ path: join(out, '1-anhang.png') })

// „doch als Text“ holt ihn zurück
await page.locator('.composer-note .link-btn').click()
await page.waitForTimeout(300)
check((await feld.inputValue()) === lang, '„doch als Text“ setzt ihn ins Feld')
check((await page.locator('.composer .attach-chip').count()) === 0, 'und nimmt den Anhang wieder weg')
check((await page.locator('.composer-note').count()) === 0, 'der Hinweis verschwindet')
await feld.fill('')

// Eine einzige sehr lange Zeile zählt über die Zeichen
await einfuegen(eineLangeZeile)
check((await feld.inputValue()) === '' && (await page.locator('.composer .attach-chip').count()) === 1, 'auch eine einzelne lange Zeile wird angehängt')
await page.locator('.composer-note .link-btn').click()
await page.waitForTimeout(300)

// Grenzen aus den Einstellungen: mit 0/0 bleibt alles im Feld
await feld.fill('')
await page.locator('.icon-btn[title="Einstellungen"]').click()
await page.locator('label', { hasText: 'ab … Zeilen ein Anhang' }).locator('input').fill('0')
await page.locator('label', { hasText: 'oder ab … Zeichen' }).locator('input').fill('0')
await page.waitForTimeout(700)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await einfuegen(lang)
check((await feld.inputValue()) === lang, 'mit 0 bleibt auch langer Text im Feld')
check((await page.locator('.composer .attach-chip').count()) === 0, 'und nichts wird angehängt')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
