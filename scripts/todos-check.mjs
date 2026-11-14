// Prüfung ohne Modellaufruf: Aufgabenliste des Agenten (TodoWrite / update_plan) im Verlauf.
// Erledigt = Haken, gerade dran = Spinner, geplant = offener Kreis; es gilt die jüngste Liste.
// Aufruf: npm run build && node scripts/todos-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/todos'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const chat = (id, title, agent) => ({ id, title, agent, cwd: root, permissionMode: 'default', sessionId: id, sessionStarted: true, createdAt: 1, updatedAt: 2 })
const todo = (id, todos) => ({ type: 'tool_use', id, name: 'TodoWrite', input: { todos }, result: { content: 'ok', isError: false } })
const liste = (zustände) =>
  ['Code ansehen', 'Umbauen', 'Prüfen'].map((content, i) => ({ content, status: zustände[i], activeForm: content }))

writeFileSync(join(userData, 'transcripts', 'claude.json'), JSON.stringify([
  { type: 'user', id: 'u1', ts: 1, text: 'Bau das um.' },
  // Erste Fassung der Liste, dann Arbeit, dann die gültige zweite Fassung
  { type: 'assistant', id: 'a1', blocks: [todo('t1', liste(['in_progress', 'pending', 'pending']))] },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'ls' }, result: { content: '', isError: false } }] },
  { type: 'assistant', id: 'a3', blocks: [todo('t2', liste(['completed', 'in_progress', 'pending']))] },
  { type: 'assistant', id: 'a4', blocks: [{ type: 'text', text: 'Soweit der Stand.' }] }
]))
// Codex schreibt dieselbe Liste als „plan“ mit Feld „step“
writeFileSync(join(userData, 'transcripts', 'codex.json'), JSON.stringify([
  { type: 'user', id: 'c1', ts: 1, text: 'Und du?' },
  { type: 'assistant', id: 'c2', blocks: [{ type: 'tool_use', id: 'p1', name: 'Plan', input: { plan: [{ step: 'Erst dies', status: 'completed' }, { step: 'Dann das', status: 'in_progress' }] }, result: { content: '', isError: false } }] }
]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify([chat('claude', 'Umbau', 'claude'), chat('codex', 'Codex-Plan', 'codex')]))

const log = (...x) => console.log('[aufgaben]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item', { hasText: 'Umbau' }).click()
await page.locator('.chat-panel').waitFor()
await page.locator('.todos').waitFor()

// Nur die jüngste Liste steht sichtbar im Verlauf, die ältere liegt in den Arbeitsschritten
check((await page.locator('.todos').count()) === 1, 'genau eine Aufgabenliste sichtbar')
const zeilen = await page.locator('.todo').evaluateAll((ns) => ns.map((n) => `${n.className.replace('todo ', '')}: ${n.innerText.trim()}`))
log(zeilen)
check(zeilen.length === 3, 'drei Schritte')
check(zeilen[0].startsWith('done:') && /Code ansehen/.test(zeilen[0]), 'erledigter Schritt')
check(zeilen[1].startsWith('doing:') && /Umbauen/.test(zeilen[1]), 'laufender Schritt')
check(zeilen[2].startsWith('pending:') && /Prüfen/.test(zeilen[2]), 'geplanter Schritt')
check((await page.locator('.todo.doing .spinner').count()) === 1, 'der laufende Schritt dreht sich')
check((await page.locator('.todo.done .todo-mark.done').count()) === 1, 'der erledigte Schritt hat einen Haken')
check((await page.locator('.steps').count()) === 1, 'die ältere Fassung bleibt in den Arbeitsschritten')
// Der Arbeitsschritt-Block zeigt die alte Fassung erst beim Aufklappen
await page.locator('.steps-head').click()
await page.waitForTimeout(200)
check((await page.locator('.todos').count()) === 2, 'aufgeklappt ist auch die alte Fassung zu sehen')
await page.screenshot({ path: join(out, '1-aufgaben.png') })

// Codex: dieselbe Darstellung aus „plan“/„step“
await page.locator('.chat-item', { hasText: 'Codex-Plan' }).click()
await page.locator('.todos').waitFor()
const codex = await page.locator('.todo').evaluateAll((ns) => ns.map((n) => `${n.className.replace('todo ', '')}: ${n.innerText.trim()}`))
log(codex)
check(codex.length === 2 && codex[0].startsWith('done:') && codex[1].startsWith('doing:'), 'Codex-Plan wird genauso gezeigt')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
