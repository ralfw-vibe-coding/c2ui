// Prüfung ohne Modellaufruf: Beim neuen Chat kommt zuerst die Liste der zuletzt
// benutzten Verzeichnisse (neuestes oben), und „Anderer Ordner …“ führt in den
// normalen Ordnerdialog. Der echte Dialog wird abgefangen, nichts wird geöffnet.
// Aufruf: npm run build && node scripts/dirs-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/dirs'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const alt = join(root, 'src')
const neuer = join(root, 'scripts')
const weg = join(root, 'gibt-es-nicht')
const anderer = join(root, 'src', 'shared')
// Zwei Chats mit verschiedenen Ordnern, der „neuere“ zuletzt benutzt. Ein dritter Ordner
// existiert nicht mehr – der darf nicht in der Liste landen.
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'eins', title: 'Alt', agent: 'claude', cwd: alt, permissionMode: 'default', sessionId: 's1', sessionStarted: true, createdAt: 1, updatedAt: 10 },
  { id: 'zwei', title: 'Neu', agent: 'claude', cwd: neuer, permissionMode: 'default', sessionId: 's2', sessionStarted: true, createdAt: 2, updatedAt: 20 },
  { id: 'drei', title: 'Fort', agent: 'claude', cwd: weg, permissionMode: 'default', sessionId: 's3', sessionStarted: true, createdAt: 3, updatedAt: 30 }
]))

const log = (...x) => console.log('[verzeichnisse]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')

// Statt des echten Ordnerdialogs: ein vorgegebener Ordner, und es wird gemerkt, dass gefragt wurde.
await app.evaluate(({ ipcMain }, ordner) => {
  globalThis.__gefragt = []
  ipcMain.removeHandler('dialog:pickDirectory')
  ipcMain.handle('dialog:pickDirectory', (_e, standard) => {
    globalThis.__gefragt.push(standard ?? null)
    return globalThis.__antwort ?? null
  })
}, anderer)

const liste = async () => page.locator('.dir-dialog .dir-item').evaluateAll((els) => els.map((e) => e.getAttribute('title')))

// 1. Neuer Chat: erst die Liste, kein Ordnerdialog
await page.locator('.sidebar-actions .new-agent').first().click()
await page.locator('.dir-dialog').waitFor()
check((await app.evaluate(() => globalThis.__gefragt)).length === 0, 'der Ordnerdialog öffnet sich nicht von selbst')
let dirs = await liste()
log('Liste:', JSON.stringify(dirs))
check(dirs.length === 2, 'nur die Ordner, die es noch gibt, stehen in der Liste')
check(!dirs.includes(weg), 'der verschwundene Ordner fehlt')
check(dirs[0] === neuer && dirs[1] === alt, 'umgekehrt chronologisch: das zuletzt benutzte Verzeichnis oben')
await page.screenshot({ path: join(out, '1-liste.png') })

// 2. Ein Verzeichnis aus der Liste startet den Chat dort
await page.locator('.dir-dialog .dir-item').nth(1).click()
await page.locator('.chat-panel').waitFor()
check((await page.locator('.dir-dialog').count()) === 0, 'der Dialog ist nach der Wahl zu')
const kopf = page.locator('.cell-header button.cell-cwd').first()
check((await kopf.getAttribute('title'))?.includes(alt) === true, 'der neue Chat arbeitet im gewählten Verzeichnis')
await page.screenshot({ path: join(out, '2-chat.png') })

// 3. Das gerade benutzte Verzeichnis steht nun oben
await page.locator('.sidebar-actions .new-agent').first().click()
await page.locator('.dir-dialog').waitFor()
dirs = await liste()
log('Liste:', JSON.stringify(dirs))
check(dirs[0] === alt && dirs[1] === neuer, 'das gerade benutzte Verzeichnis steht jetzt vorn')

// 4. „Anderer Ordner …“ öffnet den normalen Ordnerdialog
await app.evaluate((_mod, ordner) => { globalThis.__antwort = ordner }, anderer)
await page.locator('.dir-dialog .modal-actions .primary').click()
await page.locator('.chat-panel').waitFor()
const gefragt = await app.evaluate(() => globalThis.__gefragt)
log('gefragt mit Startordner:', JSON.stringify(gefragt))
check(gefragt.length === 1 && gefragt[0] === alt, 'der Ordnerdialog startet beim zuletzt benutzten Verzeichnis')
check((await page.locator('.cell-header button.cell-cwd').first().getAttribute('title'))?.includes(anderer) === true,
  'der Chat läuft im frei gewählten Ordner')

// 5. Auch dieser Ordner ist nun gemerkt – und steht oben
await page.locator('.sidebar-actions .new-agent').first().click()
await page.locator('.dir-dialog').waitFor()
dirs = await liste()
log('Liste:', JSON.stringify(dirs))
check(dirs.length === 3 && dirs[0] === anderer, 'der frei gewählte Ordner ist gemerkt und steht oben')
await page.screenshot({ path: join(out, '3-liste.png') })

// 6. Abbrechen legt keinen Chat an
const vorher = await page.locator('.chat-item').count()
await page.locator('.dir-dialog .modal-actions .btn').first().click()
await page.waitForTimeout(200)
check((await page.locator('.dir-dialog').count()) === 0, 'Abbrechen schließt den Dialog')
check((await page.locator('.chat-item').count()) === vorher, 'und legt keinen Chat an')

// 7. Nach einem Neustart ist die Liste noch da
await app.close()
const app2 = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page2 = await app2.firstWindow()
await page2.waitForSelector('.chat-item')
await page2.locator('.sidebar-actions .new-agent').first().click()
await page2.locator('.dir-dialog').waitFor()
const nachher = await page2.locator('.dir-dialog .dir-item').evaluateAll((els) => els.map((e) => e.getAttribute('title')))
log('nach Neustart:', JSON.stringify(nachher))
check(nachher.length === 3 && nachher[0] === anderer, 'die Liste überlebt den Neustart')
await app2.close()

log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
