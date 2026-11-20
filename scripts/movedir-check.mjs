// Prüfung ohne Modellaufruf: Arbeitsverzeichnis umziehen. Der Ordner mit seinen Artefakten wandert,
// und Claudes Projektordner (Verlauf und Gedächtnis) wandert mit – sonst fände `claude --resume`
// die Session am neuen Ort nicht mehr.
// Aufruf: npm run build && node scripts/movedir-check.mjs [ausgabe-verzeichnis]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/movedir'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
// Schein-Heim für Claudes Projektordner (CLAUDE_CONFIG_DIR zeigt dorthin).
const configDir = join(out, 'claude-config')
const slug = (p) => p.replace(/[^a-zA-Z0-9]/g, '-')
const alt = join(out, 'temp', 'abc')
const ziel = join(out, 'repos')
const neu = join(ziel, 'abc')
mkdirSync(alt, { recursive: true })
mkdirSync(ziel, { recursive: true })
writeFileSync(join(alt, 'ergebnis.md'), '# Artefakt aus der Sitzung\n')
const altesProjekt = join(configDir, 'projects', slug(alt))
mkdirSync(join(altesProjekt, 'memory'), { recursive: true })
writeFileSync(join(altesProjekt, 'sitzung-1.jsonl'), '{"type":"user"}\n')
writeFileSync(join(altesProjekt, 'memory', 'MEMORY.md'), '- was ich mir gemerkt habe\n')

const chat = (id, title) => ({
  id, title, agent: 'claude', cwd: alt, permissionMode: 'default', sessionId: id, sessionStarted: true,
  createdAt: 1, updatedAt: 2
})
writeFileSync(join(userData, 'chats.json'), JSON.stringify([chat('eins', 'Erster Chat'), chat('zwei', 'Zweiter Chat')]))
for (const id of ['eins', 'zwei']) writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify([]))

const log = (...x) => console.log('[umzug]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({
  args: [root], cwd: root,
  env: { ...process.env, CLAUDE2UI_USER_DATA: userData, CLAUDE_CONFIG_DIR: configDir }
})
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item', { hasText: 'Erster Chat' }).click()
await page.locator('.chat-panel').waitFor()

// Statt des echten Ordnerdialogs: der gewünschte Zielordner.
await app.evaluate(({ ipcMain }, dir) => {
  ipcMain.removeHandler('dialog:pickDirectory')
  ipcMain.handle('dialog:pickDirectory', () => globalThis.__ziel ?? dir)
}, ziel)

// Der Pfeil am Ordner öffnet den Umzug
const pfeil = page.locator('.cell-header .cell-cwd-move')
check((await pfeil.count()) === 1, 'am Ordner im Zellenkopf steht ein Knopf zum Umziehen')
await pfeil.click()
await page.locator('.move-dialog').waitFor()
const text = (await page.locator('.move-dialog').innerText()).replace(/\s+/g, ' ')
log('Dialog:', text.slice(0, 180))
check(/2 Chats arbeiten hier/.test(text), 'der Dialog sagt, wie viele Chats mitziehen')
check(/Gedächtnis/.test(text), 'und dass Verlauf und Gedächtnis mitwandern')
await page.screenshot({ path: join(out, '1-dialog.png') })

// Verschieben lassen: in den gewählten Ordner hinein
await app.evaluate((_m, dir) => { globalThis.__ziel = dir }, ziel)
await page.locator('.move-dialog .btn.primary').click()
await page.waitForTimeout(1200)
check((await page.locator('.move-dialog').count()) === 0, 'der Dialog schließt nach dem Umzug')
check(existsSync(join(neu, 'ergebnis.md')), 'die Artefakte liegen am neuen Ort')
check(!existsSync(alt), 'und nicht mehr am alten')
const neuesProjekt = join(configDir, 'projects', slug(neu))
check(existsSync(join(neuesProjekt, 'sitzung-1.jsonl')), 'Claudes Verlauf ist mitgewandert')
check(readFileSync(join(neuesProjekt, 'memory', 'MEMORY.md'), 'utf8').includes('gemerkt'), 'das Gedächtnis ebenfalls')
check(!existsSync(altesProjekt), 'der alte Projektordner ist weg')

// Beide Chats zeigen den neuen Pfad, und der Verlauf hält den Umzug fest
const kopf = await page.locator('.cell-header .cell-cwd').first().getAttribute('title')
log('Kopf:', JSON.stringify(kopf?.split('\n')[0]))
check(kopf?.startsWith(neu) === true, 'der Zellenkopf zeigt den neuen Pfad')
const chats = JSON.parse(readFileSync(join(userData, 'chats.json'), 'utf8'))
check(chats.every((c) => c.cwd === neu), 'beide Chats arbeiten jetzt dort')
const verlauf = (await page.locator('.transcript-inner').innerText()).replace(/\s+/g, ' ')
log('Verlauf:', verlauf.slice(0, 160))
check(/Arbeitsverzeichnis umgezogen/.test(verlauf), 'der Chat hält den Umzug fest')
await page.screenshot({ path: join(out, '2-umgezogen.png') })

// Zweiter Weg: Ordner ist schon woanders – nur den Pfad nachziehen
const haendisch = join(out, 'repos2', 'abc')
mkdirSync(haendisch, { recursive: true })
await app.evaluate((_m, dir) => { globalThis.__ziel = dir }, haendisch)
await page.locator('.cell-header .cell-cwd-move').click()
await page.locator('.move-dialog').waitFor()
await page.locator('.move-dialog .move-actions .btn:not(.primary)').click()
await page.waitForTimeout(1200)
check(JSON.parse(readFileSync(join(userData, 'chats.json'), 'utf8')).every((c) => c.cwd === haendisch), 'der Pfad lässt sich auch ohne Verschieben nachziehen')
check(existsSync(join(configDir, 'projects', slug(haendisch), 'sitzung-1.jsonl')), 'auch dabei wandert Claudes Projektordner mit')
check(existsSync(join(neu, 'ergebnis.md')), 'der Ordner selbst bleibt unangetastet, wo er liegt')

// Was am Ziel schon liegt, bleibt liegen: zurück an einen Ort, an dem es den Verlauf schon gibt
const belegt = join(out, 'repos3', 'abc')
mkdirSync(belegt, { recursive: true })
const belegtesProjekt = join(configDir, 'projects', slug(belegt))
mkdirSync(join(belegtesProjekt, 'memory'), { recursive: true })
writeFileSync(join(belegtesProjekt, 'memory', 'MEMORY.md'), '- schon dort\n')
await app.evaluate((_m, dir) => { globalThis.__ziel = dir }, belegt)
page.on('dialog', (d) => void d.accept())
await page.locator('.cell-header .cell-cwd-move').click()
await page.locator('.move-dialog').waitFor()
await page.locator('.move-dialog .move-actions .btn:not(.primary)').click()
await page.waitForTimeout(1500)
check(readFileSync(join(belegtesProjekt, 'memory', 'MEMORY.md'), 'utf8').includes('schon dort'), 'vorhandene Dateien am Ziel bleiben unangetastet')
check(existsSync(join(belegtesProjekt, 'sitzung-1.jsonl')), 'der Rest wandert trotzdem mit')
const liegengeblieben = join(configDir, 'projects', slug(haendisch), 'memory', 'MEMORY.md')
check(existsSync(liegengeblieben), 'was nicht mitkonnte, bleibt im alten Projektordner')
log('übrig im alten Projektordner:', readdirSync(join(configDir, 'projects', slug(haendisch))).join(', '))

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
