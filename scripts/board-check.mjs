// Sichtprüfung Diskursboard (ohne Modellaufruf): vorbereiteter Baum mit Verläufen, Board öffnen,
// Knoten anklicken (öffnet den Chat daneben an der Stelle), Board übersteht Neuladen.
// Aufruf: npm run build && node scripts/board-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/board'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const t0 = Date.now() - 3 * 3600_000
const min = (m) => t0 + m * 60_000
const base = { cwd: root, permissionMode: 'default', sessionStarted: false }
const chat = (id, title, agent, created, parent, turn) => ({
  ...base, id, title, agent, sessionId: id, createdAt: min(created), updatedAt: min(created + 30),
  ...(parent ? { forkFrom: { chatId: parent, title: parent, at: { turn } } } : {})
})
const chats = [
  chat('haus', 'Hausarbeit: Gliederung', 'claude', 0),
  chat('quellen', 'Quellenlage', 'claude', 12, 'haus', 2),
  chat('archiv', 'Archivbestände', 'codex', 20, 'quellen', 1),
  chat('methode', 'Qualitativ oder quantitativ?', 'claude', 40, 'haus', 3), // Titel = erste Nachricht
  chat('anderes', 'Anderer Chat ohne Äste', 'claude', 100)
]
const u = (id, m, text, extra = {}) => ({ type: 'user', id, ts: min(m), text, ...extra })
const a = (id) => ({ type: 'assistant', id, blocks: [{ type: 'text', text: `Antwort ${id}` }] })
const tr = {
  haus: [u('h1', 1, 'Hilf mir bei der Gliederung meiner Hausarbeit über den Bundestag.'), a('ha1'),
    u('h2', 8, 'Welche Kapitel brauche ich mindestens?'), a('ha2'),
    u('h3', 30, 'Mach aus Kapitel 3 zwei Unterkapitel.'), a('ha3'),
    u('h4', 55, 'Schreib die Einleitung als Entwurf.'), a('ha4'),
    u('h5', 70, 'Kürze sie auf eine halbe Seite.', { steer: true }), a('ha5')],
  quellen: [{ type: 'notice', id: 'n', text: 'Abgezweigt aus „Hausarbeit“' }, u('q1', 13, '> Kapitel 2: Forschungsstand\n\nWelche Quellen gibt es dazu?'), a('qa1'),
    u('q2', 18, 'Nur deutschsprachige bitte.'), a('qa2'), u('q3', 45, 'Fasse die drei wichtigsten zusammen.'), a('qa3')],
  archiv: [{ type: 'notice', id: 'n', text: 'Abgezweigt aus „Quellenlage“' }, u('ar1', 21, '> Bundestagsarchiv\n\nWie komme ich an die Protokolle?'), a('ara1'),
    u('ar2', 25, 'A2UI-Aktion: ' + JSON.stringify({ name: 'antrag_absenden', surfaceId: 'antrag' })), a('ara2')],
  methode: [{ type: 'notice', id: 'n', text: 'Abgezweigt aus „Hausarbeit“' }, u('m1', 41, '> Kapitel 3: Methode\n\nQualitativ oder quantitativ?'), a('ma1')],
  anderes: [u('x1', 100, 'Etwas ganz anderes.'), a('xa1')]
}
for (const [id, t] of Object.entries(tr)) writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify(t))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...x) => console.log('[board]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
const prefix = await page.evaluate(async () => (await window.api.transcript('archiv')).find((i) => i.id === 'ar2')?.text.slice(0, 15))
log('Aktionspräfix im Transkript:', prefix)

// Board über die Seitenleiste öffnen (an einem Nebenchat)
const item = page.locator('.chat-item', { hasText: 'Archivbestände' })
await item.hover()
await item.locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
const rows = await page.locator('.board-row').count()
const lanes = await page.locator('.board-legend-item').allInnerTexts()
log('Zeilen:', rows, '| Spuren:', lanes.join(' | '))
check(rows === 11, '11 Nachrichten aus vier Chats')
check(lanes.length === 4 && lanes[0].includes('Hausarbeit'), 'vier Spuren, Wurzel zuerst')
check((await page.locator('.board-graph path').count()) === 3, 'drei Abzweig-Kanten')
check((await page.locator('.cell-title', { hasText: 'Diskurs: Hausarbeit' }).count()) === 1, 'Zellentitel nennt den Diskurs')
await page.screenshot({ path: join(out, '1-board.png') })
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.board-chip')].map((c) => ({ text: c.textContent.trim(), border: getComputedStyle(c).borderTopColor }))
)
log('Chips:', JSON.stringify(chips))
const bare = chips.filter((c) => !c.text)
check(bare.length === 1 && /rgba\(0, 0, 0, 0\)|transparent/.test(bare[0].border), 'Chip ohne Text hat keinen Rahmen')
check(chips.filter((c) => c.text).every((c) => !/rgba\(0, 0, 0, 0\)/.test(c.border)), 'Chips mit Text haben ihren Rahmen')
// Hover über einer Zeile darf den Graphen nicht verdecken
await page.locator('.board-row', { hasText: 'Welche Quellen' }).hover()
const onTop = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.board-row')].find((r) => r.textContent.includes('Welche Quellen'))
  const c = document.querySelector('.board-graph circle')
  const rr = row.getBoundingClientRect()
  const g = document.querySelector('.board-graph').getBoundingClientRect()
  // Punkt auf der Spur der Wurzel in dieser Zeile: was liegt oben?
  const el = document.elementsFromPoint(g.left + 14, rr.top + rr.height / 2)
  return el.findIndex((e) => e.closest('svg')) < el.findIndex((e) => e.classList.contains('board-row'))
})
check(onTop, 'Graph liegt beim Hover über dem Zeilenhintergrund')
await page.screenshot({ path: join(out, '1b-hover.png') })

// Knoten anklicken → Chat öffnet daneben an der Stelle
await page.locator('.board-row', { hasText: 'Nur deutschsprachige' }).click()
await page.locator('.cell .chat-panel').first().waitFor()
await page.waitForTimeout(600)
const opened = await page.evaluate(() => {
  const panel = document.querySelector('.chat-panel')
  const flash = panel?.querySelector('.jump-flash')
  return { chat: panel?.getAttribute('data-chat-id'), flash: flash?.textContent?.slice(0, 30) }
})
log('geöffnet:', JSON.stringify(opened), '| Zellen:', await page.locator('.cell').count())
check(opened.chat === 'quellen' && /deutschsprachige/.test(opened.flash ?? ''), 'Nebenchat geöffnet, Nachricht hervorgehoben')
await page.screenshot({ path: join(out, '2-geoeffnet.png') })

// Anderer Knoten → gleiche Zielzelle wird wiederverwendet
const cells = await page.locator('.cell').count()
await page.locator('.board-row', { hasText: 'Qualitativ' }).click()
await page.waitForTimeout(600)
check((await page.locator('.cell').count()) === cells, 'gleiche Zielzelle wiederverwendet')
check((await page.locator('.chat-panel').first().getAttribute('data-chat-id')) === 'methode', 'jetzt Methode geöffnet')
const activeRows = async () => page.locator('.board-row.active').allInnerTexts()
log('Hervorgehoben:', (await activeRows()).map((t) => t.slice(0, 25)))
check((await activeRows()).length === 1 && /Qualitativ/.test((await activeRows())[0]), 'aktiver Chat (Methode) hervorgehoben')
check((await page.locator('.board-legend-item.active').innerText()).includes('Qualitativ'), 'Legende markiert den aktiven Chat')
check((await page.locator('.board-active-lane').count()) >= 1, 'Spur des aktiven Chats gelb unterlegt')
// Klick ins Board (Board-Zelle markiert): Hervorhebung bleibt beim zuletzt aktiven Chat
await page.locator('.board-legend').click()
check((await activeRows()).length === 1 && /Qualitativ/.test((await activeRows())[0]), 'bleibt beim Klick ins Board')
// Chat wechseln: über die Seitenleiste Quellenlage in die Chat-Zelle legen
await page.locator('.cell').nth(1).click()
await page.locator('.chat-item', { hasText: 'Quellenlage' }).click()
await page.waitForTimeout(300)
log('Hervorgehoben nach Wechsel:', (await activeRows()).map((t) => t.slice(0, 25)))
check((await activeRows()).length === 3 && (await activeRows()).some((t) => /deutschsprachige/.test(t)), 'Hervorhebung folgt dem Wechsel')
await page.screenshot({ path: join(out, '3-aktiv.png') })
// Chat schließen (Zelle bleibt): keine Hervorhebung mehr
await page.locator('.cell').nth(1).locator('.icon-btn[title^="Chat schließen"]').click()
await page.waitForTimeout(200)
check((await activeRows()).length === 0 && (await page.locator('.board-active-lane').count()) === 0, 'kein offener Chat → keine Hervorhebung')

// Board übersteht Neuladen
await page.waitForTimeout(800)
await page.reload()
await page.locator('.board-row').first().waitFor({ timeout: 10_000 }).catch(() => {})
await page.waitForTimeout(300)
log('Layout nach Neuladen:', JSON.stringify(await page.evaluate(async () => (await window.api.init()).layout)).slice(0, 300))
check((await page.locator('.board-row').count()) === 11, 'Board nach Neuladen wieder da')
await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
