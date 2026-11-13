// Prüfung ohne Modellaufruf: Zusammenführen per Ziehen im Board, auch wenn der Ursprung nur einen Knoten hat.
// Aufruf: npm run build && node scripts/merge-drop-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/merge-drop'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const t0 = Date.now() - 3600_000
const min = (m) => t0 + m * 60_000
const base = { cwd: root, permissionMode: 'default', sessionStarted: false, agent: 'claude' }
const chats = [
  { ...base, id: 'r', title: 'Ursprung', sessionId: 'r', createdAt: min(0), updatedAt: min(1) },
  { ...base, id: 'b', title: 'Nebenchat', sessionId: 'b', createdAt: min(2), updatedAt: min(5), forkFrom: { chatId: 'r', title: 'Ursprung', at: { turn: 1 } } }
]
const u = (id, m, text) => ({ type: 'user', id, ts: min(m), text })
const a = (id) => ({ type: 'assistant', id, blocks: [{ type: 'text', text: `Antwort ${id}` }] })
const tr = { r: [u('r1', 1, 'Einzige Frage im Ursprung'), a('ra1')], b: [u('b1', 3, 'Erste Frage im Ast'), a('ba1'), u('b2', 4, 'Zweite Frage im Ast'), a('ba2')] }
for (const [id, t] of Object.entries(tr)) writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify(t))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...x) => console.log('[merge-drop]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
const item = page.locator('.chat-item', { hasText: 'Ursprung' })
await item.hover()
await item.locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
log('Zeilen:', await page.locator('.board-row').allInnerTexts())

// Ziel: Text der Zeile bzw. der Knotenpunkt der Abzweigstelle (liegt im Graphen über der Zeile)
for (const [what, dst] of [['Text', page.locator('.board-row', { hasText: 'Einzige Frage' }).locator('.board-label')], ['Knotenpunkt', page.locator('.board-fork').first()]]) {
  await page.locator('.board-row', { hasText: 'Zweite Frage' }).dragTo(dst)
  const ok = await page.locator('.merge-dialog').waitFor({ timeout: 2000 }).then(() => true, () => false)
  check(ok, `Ziehen auf den einzigen Knoten des Ursprungs (${what}) öffnet den Dialog`)
  if (ok) {
    check(/Nebenchat → Ursprung/.test((await page.locator('.merge-route').innerText()).replace(/\s+/g, ' ')), 'Richtung B → A')
    await page.locator('.merge-dialog .btn', { hasText: 'Abbrechen' }).click()
  }
}
await page.screenshot({ path: join(out, 'board.png') })
await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
