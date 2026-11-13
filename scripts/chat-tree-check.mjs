// Sichtprüfung Chat-Baum (ohne Modellaufruf): vorbereitete Chats mit Abzweigungen, Auf-/Zuklappen.
// Aufruf: npm run build && node scripts/chat-tree-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/chat-tree'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })
const now = Date.now()
const c = (id, title, agent, created, parent, quote) => ({
  id, title, cwd: root, agent, permissionMode: agent === 'codex' ? 'workspace-write' : 'default', sessionId: id, sessionStarted: false,
  createdAt: now - created * 60_000, updatedAt: now - created * 60_000,
  ...(parent ? { forkFrom: { chatId: parent, title: parent, at: { turn: 3, quote } } } : {})
})
const chats = [
  c('haus', 'Hausarbeit: Gliederung', 'claude', 100),
  c('haus-q', 'Nachfrage: Quellenlage', 'claude', 80, 'haus', 'Die Quellenlage ist dünn'),
  c('haus-q-1', 'Nachfrage: Archivbestände', 'codex', 70, 'haus-q', 'Archiv'),
  c('haus-m', 'Nachfrage: Methode', 'claude', 60, 'haus', 'qualitative Methode'),
  c('praes', 'Präsentation Q4', 'codex', 30),
  c('praes-z', 'Nachfrage: Zahlen prüfen', 'codex', 20, 'praes', 'Umsatz +12 %'),
  c('allein', 'Einzelner Chat ohne Äste', 'claude', 10)
]
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...a) => console.log('[baum]', ...a)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await page.evaluate(() => localStorage.removeItem('c2ui.collapsedChats'))
await page.reload()
await page.waitForSelector('.chat-item')
const titles = async () => page.locator('.chat-item .chat-title').allInnerTexts()
log('Reihenfolge:', (await titles()).join(' | '))
check((await titles()).join('|') === 'Einzelner Chat ohne Äste|Präsentation Q4|Nachfrage: Zahlen prüfen|Hausarbeit: Gliederung|Nachfrage: Quellenlage|Nachfrage: Archivbestände|Nachfrage: Methode', 'Baum in richtiger Reihenfolge')
check((await page.locator('.chat-item.nested').count()) === 4, 'vier eingerückte Nebenchats')
await page.locator('.sidebar').screenshot({ path: join(out, '1-baum.png') })
await page.locator('.chat-item', { hasText: 'Hausarbeit' }).locator('.tree-toggle').click()
check((await titles()).length === 4, 'Zuklappen blendet den Teilbaum aus')
check((await page.locator('.chat-item', { hasText: 'Hausarbeit' }).locator('.tree-count').innerText()) === '+3', 'Zähler zeigt drei Nebenchats')
await page.locator('.sidebar').screenshot({ path: join(out, '2-zu.png') })
await page.reload()
await page.waitForSelector('.chat-item')
check((await titles()).length === 4, 'Zugeklappt bleibt nach Neuladen')
await page.locator('.chat-item', { hasText: 'Hausarbeit' }).locator('.tree-toggle').click()
check((await titles()).length === 7, 'Aufklappen zeigt alles wieder')
const tip = await page.locator('.chat-item', { hasText: 'Archivbestände' }).getAttribute('title')
check(/Abgezweigt aus „haus-q“ nach 3 Turns/.test(tip ?? ''), 'Tooltip nennt den Abzweigpunkt')
await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
