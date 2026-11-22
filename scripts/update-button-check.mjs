// Prüfung ohne echte Aktualisierung: das Zeichen zum Prüfen auf Updates in der Seitenleiste.
// Der Updater selbst wird abgefangen – geprüft wird, was das Zeichen zeigt und was ein Klick tut.
// Aufruf: npm run build && node scripts/update-button-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/update-button'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'c', title: 'Ein Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'c', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))
writeFileSync(join(userData, 'transcripts', 'c.json'), JSON.stringify([]))

const log = (...x) => console.log('[update-knopf]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')

// Den Updater abfangen: Zustand vorgeben und mitschreiben, was die Oberfläche verlangt.
await app.evaluate(({ ipcMain }) => {
  globalThis.__zustand = { state: 'current', folder: '/updates', checked: new Date().toISOString() }
  globalThis.__gerufen = []
  for (const [kanal, fn] of [
    ['update:state', () => globalThis.__zustand],
    ['update:check', () => {
      globalThis.__gerufen.push('check')
      return globalThis.__naechster ?? globalThis.__zustand
    }],
    ['update:install', () => {
      globalThis.__gerufen.push('install')
      return { state: 'installing', folder: '/updates', offer: { version: '0.1.0', build: 99, file: '/updates/C2UI-b99.zip' } }
    }]
  ]) {
    ipcMain.removeHandler(kanal)
    ipcMain.handle(kanal, fn)
  }
})
await page.reload()
await page.waitForSelector('.chat-item')
await page.waitForTimeout(400)

const knopf = page.locator('.sidebar-bottom .update-btn')
check((await knopf.count()) === 1, 'in der Seitenleiste steht ein Zeichen zum Prüfen')
const reihenfolge = await page.locator('.sidebar-bottom button').evaluateAll((bs) =>
  bs.map((b) => (b.classList.contains('update-btn') ? 'update' : (b.title || '?')))
)
log('Knöpfe unten:', JSON.stringify(reihenfolge))
check(reihenfolge.indexOf('update') === reihenfolge.indexOf('Einstellungen') - 1, 'es steht links neben den Einstellungen')
check((await knopf.locator('svg').count()) === 1, 'und zeigt ein Symbol')
check(!(await knopf.evaluate((e) => e.classList.contains('available'))), 'solange nichts da ist, ist es nicht eingefärbt')
log('Tooltip:', await knopf.getAttribute('title'))
check(/zuletzt geprüft/.test((await knopf.getAttribute('title')) ?? ''), 'der Tooltip sagt, wann zuletzt geprüft wurde')
await page.screenshot({ path: join(out, '1-ruhig.png') })

// Klick prüft – und gibt eine Antwort, auch wenn nichts da ist
await knopf.click()
await page.waitForTimeout(300)
check((await app.evaluate(() => globalThis.__gerufen)).includes('check'), 'der Klick prüft auf Updates')
check(/Alles aktuell/.test((await knopf.getAttribute('title')) ?? ''), 'und sagt kurz, dass alles aktuell ist')
await page.waitForTimeout(1800)

// Findet die App ein Update, ist das Zeichen eingefärbt
await app.evaluate(() => {
  globalThis.__naechster = { state: 'available', folder: '/updates', checked: new Date().toISOString(), offer: { version: '0.1.0', build: 99, file: '/updates/C2UI-b99.zip' } }
})
await knopf.click()
await page.waitForTimeout(400)
check(await knopf.evaluate((e) => e.classList.contains('available')), 'mit einem Update ist das Zeichen eingefärbt')
const farbe = await knopf.evaluate((e) => getComputedStyle(e).color)
const akzent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
log('Farbe:', farbe, 'Akzent:', akzent)
check(/\d/.test(farbe) && farbe !== 'rgb(0, 0, 0)', 'in der Akzentfarbe')
log('Tooltip:', await knopf.getAttribute('title'))
check(/Build 99/.test((await knopf.getAttribute('title')) ?? ''), 'der Tooltip nennt den bereitliegenden Build')
check((await page.locator('.update-dot').count()) === 0, 'der alte Punkt an den Einstellungen ist weg')
await page.screenshot({ path: join(out, '2-update-da.png') })

// Klick auf das eingefärbte Zeichen aktualisiert
await knopf.click()
await page.waitForTimeout(500)
check((await app.evaluate(() => globalThis.__gerufen)).includes('install'), 'der Klick darauf stößt die Aktualisierung an')
check(await knopf.isDisabled(), 'während der Aktualisierung ist es gesperrt')

// Ohne Update-Ordner führt der Klick in die Einstellungen
await app.evaluate(() => { globalThis.__zustand = { state: 'off' } })
await page.reload()
await page.waitForSelector('.chat-item')
await page.waitForTimeout(400)
const ohne = page.locator('.sidebar-bottom .update-btn')
log('Tooltip ohne Ordner:', await ohne.getAttribute('title'))
check(/Update-Ordner/.test((await ohne.getAttribute('title')) ?? ''), 'ohne Update-Ordner sagt der Tooltip, was fehlt')
await ohne.click()
await page.waitForTimeout(400)
check((await page.locator('.modal h2', { hasText: 'Einstellungen' }).count()) === 1, 'und der Klick führt in die Einstellungen')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
