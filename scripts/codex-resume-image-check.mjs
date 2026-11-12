// Prüft mit echter Codex CLI: (1) Rückfallweg, wenn `codex exec resume` an einem „paginated“-Thread
// scheitert, (2) Anzeige von Bildern aus der Codex-Bildgenerierung.
// Aufruf: npm run build && node scripts/codex-resume-image-check.mjs <paginated-thread-id>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/codex-resume')
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [join(userData, 'transcripts'), work]) mkdirSync(d, { recursive: true })
const thread = process.argv[2]
const id = 'codex-alt'
const now = Date.now()
writeFileSync(join(userData, 'chats.json'), JSON.stringify([{ id, title: 'Alter Codex-Chat', cwd: work, agent: 'codex', permissionMode: 'workspace-write', model: '', sessionId: thread, sessionStarted: true, createdAt: now, updatedAt: now }]))
writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify([
  { type: 'user', id: 'u1', text: 'Merk dir bitte: Mein Lieblingstier ist der Fischotter.', ts: now },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Alles klar, dein Lieblingstier ist der Fischotter.' }] },
  { type: 'turn', id: 't1', durationMs: 1000, isError: false }
]))
writeFileSync(join(userData, 'layout.json'), JSON.stringify({ root: { type: 'leaf', id: 'cell-1', chatId: id }, selectedCellId: 'cell-1' }))

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.cell textarea')
const cell = page.locator('.cell').first()
async function send(text, n) {
  await cell.locator('textarea').fill(text)
  await cell.locator('textarea').press('Enter')
  await cell.locator('.msg-turn').nth(n).waitFor({ timeout: 480_000 })
}
await send('Was ist mein Lieblingstier? Antworte in einem kurzen Satz.', 1)
console.log('Hinweise:', (await cell.locator('.msg-notice').allInnerTexts()).map((t) => t.slice(0, 90)).join(' | '))
console.log('Antwort:', (await cell.locator('.msg-assistant').last().innerText()).replace(/\s+/g, ' ').slice(0, 160))
console.log('Fehler:', (await cell.locator('.msg-error').allInnerTexts()).join(' | ').slice(0, 200))

await send('Erzeuge mit der Bildgenerierung ein sehr kleines Bild: ein blaues Quadrat auf weißem Grund. Speichere nichts im Ordner.', 2)
console.log('Bilder im Chat:', JSON.stringify(await cell.locator('.msg-image img').evaluateAll((es) => es.map((e) => [e.getAttribute('src')?.slice(-60), e.naturalWidth]))))
await page.screenshot({ path: join(out, 'ergebnis.png') })
await app.close()
