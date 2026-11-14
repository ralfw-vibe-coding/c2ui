// Prüfung ohne Modellaufruf: Der Ordner im Zellenkopf öffnet ihn im Finder.
// Geöffnet wird hier natürlich nichts – stattdessen wird gemerkt, womit die App es versucht.
// Aufruf: npm run build && node scripts/cwd-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/cwd'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const cwd = join(root, 'src')
writeFileSync(join(userData, 'transcripts', 'eins.json'), JSON.stringify([{ type: 'user', id: 'u1', ts: 1, text: 'Hallo' }]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'eins', title: 'Ein Chat', agent: 'claude', cwd, permissionMode: 'default', sessionId: 'eins', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))

const log = (...x) => console.log('[ordner]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

// Statt wirklich den Finder zu öffnen: den Aufruf im Hauptprozess abfangen.
await app.evaluate(({ ipcMain }) => {
  globalThis.__geoeffnet = []
  ipcMain.removeHandler('shell:reveal')
  ipcMain.handle('shell:reveal', (_e, p) => {
    globalThis.__geoeffnet.push(p)
    return ''
  })
})

const knopf = page.locator('.cell-header button.cell-cwd')
check((await knopf.count()) === 1, 'der Ordner im Zellenkopf ist ein Knopf')
const titel = await knopf.getAttribute('title')
log('Tooltip:', JSON.stringify(titel))
check(titel?.includes(cwd) && /Finder/.test(titel ?? ''), 'der Tooltip zeigt den ganzen Pfad und was der Klick tut')
await knopf.click()
await page.waitForTimeout(300)
const geoeffnet = await app.evaluate(() => globalThis.__geoeffnet)
log('geöffnet:', JSON.stringify(geoeffnet))
check(geoeffnet.length === 1 && geoeffnet[0] === cwd, 'der Klick öffnet genau das Arbeitsverzeichnis des Chats')
await page.screenshot({ path: join(out, '1-kopf.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
