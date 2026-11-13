// Sichtprüfung Diskurs Schritt 2 (ohne Modellaufruf): Markierungen an Abzweigstellen im Ursprung,
// Brotkrumen im Nebenchat mit Sprung zurück, ziehbare Seitenleiste.
// Aufruf: npm run build && node scripts/fork-nav-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/fork-nav'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const now = Date.now()
const base = { cwd: root, agent: 'claude', permissionMode: 'default', sessionStarted: false }
const lorem = (n) => Array.from({ length: n }, (_, i) => `Absatz ${i + 1}: Der Bundestag ist das Parlament der Bundesrepublik.`).join('\n\n')
const src = [
  { type: 'user', id: 'u1', text: 'Erkläre mir den Bundestag.', ts: now },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: lorem(12) + '\n\nDie Fraktionen bilden Ausschüsse.' }] },
  { type: 'turn', id: 't1', durationMs: 3000, isError: false },
  { type: 'user', id: 'u2', text: 'Und der Bundesrat?', ts: now },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: lorem(15) }] },
  { type: 'turn', id: 't2', durationMs: 3000, isError: false }
]
const fork = (id, title, itemId, quote, parent = 'src', parentTitle = 'Erkläre mir den Bundestag') => ({
  ...base, id, title, sessionId: id, createdAt: now - 1000, updatedAt: now - 1000,
  forkFrom: { chatId: parent, title: parentTitle, at: { turn: 2, itemId, quote } }
})
const chats = [
  { ...base, id: 'src', title: 'Erkläre mir den Bundestag', sessionId: 'src', createdAt: now - 9000, updatedAt: now - 9000 },
  fork('f1', 'Nachfrage: Ausschüsse', 'a1', 'Die Fraktionen bilden Ausschüsse.'),
  fork('f2', 'Nachfrage: Fraktionen', 'a1', 'Fraktionen'),
  fork('f3', 'Nachfrage: Bundesrat', 'a2', 'Absatz 3')
]
for (const c of chats.filter((c) => c.forkFrom)) {
  writeFileSync(join(userData, 'transcripts', `${c.id}.json`), JSON.stringify([
    { type: 'notice', id: 'n', text: `Abgezweigt aus „${c.forkFrom.title}“ – der bisherige Verlauf ist bekannt. Screens von dort erscheinen hier nicht.` },
    { type: 'user', id: 'q', text: `> ${c.forkFrom.at.quote}\n\nWas heißt das?`, ts: now }
  ]))
}
writeFileSync(join(userData, 'transcripts', 'src.json'), JSON.stringify(src))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...a) => console.log('[fork-nav]', ...a)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await page.evaluate(() => { localStorage.removeItem('c2ui.sidebarWidth'); localStorage.removeItem('c2ui.collapsedChats') })
await page.reload()
await page.waitForSelector('.chat-item')

// Ursprung öffnen: Markierungen
await page.locator('.chat-item', { hasText: 'Erkläre mir den Bundestag' }).click()
await page.locator('.fork-markers').first().waitFor()
const markers = await page.locator('.fork-markers').allInnerTexts()
log('Markierungen:', markers.map((m) => m.replace(/\n/g, ' ')))
check(markers.length === 2 && /2 Nachfragen/.test(markers[0]) && /Nachfrage/.test(markers[1]), 'zwei Stellen: 2 Nachfragen nach Antwort 1, eine nach Antwort 2')
const afterA1 = await page.evaluate(() => {
  const m = document.querySelector('.fork-markers')
  return m?.parentElement?.getAttribute('data-item-id')
})
check(afterA1 === 'a1', 'erste Markierung steht bei Antwort 1')
await page.screenshot({ path: join(out, '1-markierungen.png') })

// Klick auf Nebenchat → öffnet rechts daneben
await page.locator('.fork-pill', { hasText: 'Ausschüsse' }).click()
await page.locator('.cell').nth(1).waitFor()
check((await page.locator('.cell').count()) === 2, 'Nebenchat daneben geöffnet')
const right = page.locator('.cell').nth(1)
check((await right.locator('.fork-crumbs').count()) === 1, 'Nebenchat zeigt Brotkrumen')
await page.screenshot({ path: join(out, '2-nebenchat.png') })

// Brotkrumen: Ursprung schließen, dann über die Krume links öffnen und an die Stelle springen
await page.locator('.cell').first().locator('.cell-header .icon-btn[title*="schließen" i], .cell-header button[title*="Schließen"]').first().click().catch(() => {})
await page.locator('.chat-item', { hasText: 'Ausschüsse' }).click()
await page.waitForTimeout(300)
const cellsBefore = await page.locator('.cell').count()
await page.locator('.fork-crumbs .crumb').first().click()
await page.waitForTimeout(800)
const pos = await page.evaluate(() => {
  const pill = document.querySelector('[data-fork-child="f1"]')
  const tr = pill?.closest('.transcript')
  if (!pill || !tr) return null
  const p = pill.getBoundingClientRect(), t = tr.getBoundingClientRect()
  return { visible: p.top >= t.top && p.bottom <= t.bottom, atBottom: tr.scrollHeight - tr.scrollTop - tr.clientHeight < 60, flash: pill.classList.contains('a2ui-flash') }
})
log('Zellen vorher/nachher:', cellsBefore, await page.locator('.cell').count(), '| Sprung:', JSON.stringify(pos))
check(!!pos?.visible && !pos.atBottom && pos.flash, 'Ursprung geöffnet, an die Abzweigstelle gesprungen und markiert')
const order = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.cell')]
  return { src: cells.findIndex((c) => c.querySelector('.fork-markers')), fork: cells.findIndex((c) => c.querySelector('.fork-crumbs')) }
})
check(order.src >= 0 && order.src < order.fork, 'Ursprung steht links vom Nebenchat')
await page.screenshot({ path: join(out, '3-zurueck.png') })

// Seitenleiste ziehen
const sb = page.locator('.sidebar')
const w0 = (await sb.boundingBox()).width
const h = await page.locator('.sidebar-resizer').boundingBox()
await page.mouse.move(h.x + h.width / 2, h.y + 300)
await page.mouse.down()
await page.mouse.move(h.x + h.width / 2 + 120, h.y + 300, { steps: 6 })
await page.mouse.up()
const w1 = (await sb.boundingBox()).width
check(Math.abs(w1 - w0 - 120) < 6, `Seitenleiste breiter (${Math.round(w0)} → ${Math.round(w1)})`)
await page.reload()
await page.waitForSelector('.sidebar')
const w2 = (await page.locator('.sidebar').boundingBox()).width
check(Math.abs(w2 - w1) < 2, 'Breite bleibt nach Neuladen')
await page.locator('.sidebar-resizer').dblclick()
check(Math.abs((await page.locator('.sidebar').boundingBox()).width - 260) < 2, 'Doppelklick: Standardbreite')
await page.screenshot({ path: join(out, '4-breite.png') })
await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
