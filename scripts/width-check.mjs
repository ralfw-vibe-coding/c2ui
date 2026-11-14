// Prüfung ohne Modellaufruf: größte Breite des Chats. In einer schmalen Zelle füllt er sie aus,
// in einer breiten wächst er nur bis zur eingestellten Grenze – lange Zeilen liest man schlecht.
// Aufruf: npm run build && node scripts/width-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/width'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const lang = Array.from({ length: 6 }, (_, i) => `Absatz ${i + 1}: ${'Ein ziemlich langer Satz über den Bundestag und seine Protokolle. '.repeat(3)}`).join('\n\n')
writeFileSync(join(userData, 'transcripts', 'haus.json'), JSON.stringify([
  { type: 'user', id: 'u1', ts: 1, text: 'Erzähl ausführlich.' },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: lang }] }
]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'haus', title: 'Hausarbeit', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'haus', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))

const log = (...x) => console.log('[breite]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

const breiten = async () => {
  const t = await page.locator('.transcript').boundingBox()
  const i = await page.locator('.transcript-inner').boundingBox()
  const e = await page.locator('.composer-row').boundingBox()
  return { zelle: Math.round(t.width), text: Math.round(i.width), textX: Math.round(i.x), zelleX: Math.round(t.x), eingabe: Math.round(e.width) }
}

// Breites Fenster: der Chat bleibt bei der eingestellten Grenze (Standard 820) stehen
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(2000, 900))
await page.waitForTimeout(500)
const breit = await breiten()
log('breit:', JSON.stringify(breit))
check(breit.zelle > 1200, 'die Zelle ist weit breiter als die Grenze')
check(breit.text === 820, 'der Verlauf bleibt bei 820 Pixeln')
check(breit.eingabe <= 820, 'das Eingabefeld ebenso')
// Die Zelle hat 16 Pixel Innenabstand; darin steht der Chat mittig.
const mitte = breit.textX - breit.zelleX
check(Math.abs(mitte - (16 + (breit.zelle - 32 - breit.text) / 2)) < 6, 'und steht mittig in der Zelle')
await page.screenshot({ path: join(out, '1-breit.png') })

// Schmales Fenster: der Chat füllt die Zelle aus
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 900))
await page.waitForTimeout(500)
const schmal = await breiten()
log('schmal:', JSON.stringify(schmal))
check(schmal.text < 820 && schmal.text > schmal.zelle - 40, 'in der schmalen Zelle nutzt der Chat die volle Breite')
await page.screenshot({ path: join(out, '2-schmal.png') })

// Die Einstellung lässt sich im Dialog ändern und wirkt sofort
const breiteSetzen = async (px) => {
  await page.locator('.icon-btn[title="Einstellungen"]').click()
  const feld = page.locator('label', { hasText: 'Größte Breite des Chats' }).locator('input')
  await feld.fill(String(px))
  await page.locator('.modal-actions .btn.primary').click()
  await page.waitForTimeout(400)
}
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(2000, 900))
await page.waitForTimeout(400)
await breiteSetzen(500)
const eng = await breiten()
log('nach Einstellung 500:', JSON.stringify(eng))
check(eng.text === 500, 'eine andere Grenze aus den Einstellungen gilt sofort')

// 0 heißt: so breit wie die Zelle
await breiteSetzen(0)
const voll = await breiten()
log('nach Einstellung 0:', JSON.stringify(voll))
check(voll.text > voll.zelle - 40, '0 heißt: so breit wie die Zelle')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
