// Prüfung ohne Modellaufruf: Suche über alle Chats – Treffer finden, öffnen (Klick, ⌘-Klick, Ziehen).
// Aufruf: npm run build && node scripts/search-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/search'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const base = { cwd: root, permissionMode: 'default', sessionStarted: true, agent: 'claude' }
const chats = [
  { ...base, id: 'haus', title: 'Hausarbeit: Gliederung', sessionId: 'haus', createdAt: 1, updatedAt: 10 },
  { ...base, id: 'quellen', title: 'Quellenlage', sessionId: 'quellen', createdAt: 2, updatedAt: 20 },
  { ...base, id: 'kochen', title: 'Kochen am Wochenende', sessionId: 'kochen', createdAt: 3, updatedAt: 30, agent: 'codex' }
]
const u = (id, text, ts) => ({ type: 'user', id, ts, text })
const a = (id, text) => ({ type: 'assistant', id, blocks: [{ type: 'text', text }] })
const tr = {
  haus: [u('h1', 'Hilf mir bei der Gliederung über den Bundestag.', 1), a('ha1', 'Gern. Kapitel 1 bis 4.'), u('h2', 'Welche Quellen brauche ich?', 2)],
  quellen: [u('q1', 'Wo finde ich Protokolle?', 3), a('qa1', 'Im Bundestagsarchiv liegen alle Protokolle der Sitzungen.')],
  kochen: [u('k1', 'Was koche ich am Samstag?', 4), a('ka1', 'Ein Risotto mit Pilzen.')]
}
for (const [id, t] of Object.entries(tr)) writeFileSync(join(userData, 'transcripts', `${id}.json`), JSON.stringify(t))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...x) => console.log('[suche]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
const box = page.locator('.search-box input')

// Suchen: Treffer in Titeln und Verläufen, neueste Chats zuerst
await box.fill('protokolle')
await page.locator('.search-results').waitFor()
await page.waitForTimeout(300)
const titel = await page.locator('.search-chat-title').allInnerTexts()
const stellen = await page.locator('.search-hit').allInnerTexts()
log('Chats:', titel, '| Stellen:', stellen.map((t) => t.replace(/\s+/g, ' ').slice(0, 60)))
check(titel.length === 1 && titel[0] === 'Quellenlage', 'nur der passende Chat')
check(stellen.length === 2, 'Frage und Antwort gefunden')
check(/Bundestagsarchiv/.test(stellen[1]), 'Ausschnitt der Antwort')
const rollen = await page.locator('.search-role').evaluateAll((ns) => ns.map((n) => n.title))
log('Rollen:', rollen)
check(rollen.join('|') === 'Frage|Antwort', 'Rollen als Symbol mit Tooltip')
await page.screenshot({ path: join(out, '1-treffer.png') })

await box.fill('quelle')
await page.waitForTimeout(400)
const titel2 = await page.locator('.search-chat-title').allInnerTexts()
log('Chats für „quelle“:', titel2)
check(titel2.join('|') === 'Quellenlage|Hausarbeit: Gliederung', 'Titeltreffer und Verlauftreffer, neueste zuerst')
check((await page.locator('.search-chat.match').count()) === 1, 'Titeltreffer ist hervorgehoben')
check((await page.locator('.chat-list').count()) === 0, 'Chatliste weicht der Trefferliste')

// Klick auf eine Stelle: Chat öffnet und springt dorthin.
// „quelle“ steht im Titel von Quellenlage (keine Stelle) und im Verlauf von Hausarbeit – der erste
// Treffer im Verlauf gehört also zu Hausarbeit.
await page.locator('.search-hit').first().click()
await page.locator('.chat-panel').waitFor()
await page.waitForTimeout(700)
const offen = await page.evaluate(() => document.querySelector('.chat-panel')?.getAttribute('data-chat-id'))
// Hervorgehoben wird nur der Suchbegriff im gewählten Eintrag, nicht der ganze Turn.
const marken = await page.evaluate(() => {
  const h = CSS.highlights?.get('c2-jump')
  return h ? [...h].map((r) => ({ text: r.toString(), eintrag: r.startContainer.parentElement?.closest('.unit')?.dataset.itemId })) : []
})
log('offen:', offen, '| markiert:', JSON.stringify(marken))
check(offen === 'haus', 'Chat des Treffers geöffnet')
check(marken.length === 1 && /^Quelle/i.test(marken[0].text) && marken[0].eintrag === 'h2', 'nur der Suchbegriff im gewählten Eintrag ist markiert')
check((await page.locator('.jump-flash').count()) === 0, 'der ganze Turn leuchtet nicht mehr auf')

// ⌘-Klick: neue Zelle
const zellen = await page.locator('.cell').count()
await page.locator('.search-chat', { hasText: 'Quellenlage' }).click({ modifiers: ['Meta'] })
await page.waitForTimeout(500)
log('Zellen:', zellen, '→', await page.locator('.cell').count())
check((await page.locator('.cell').count()) === zellen + 1, '⌘-Klick öffnet eine neue Zelle')

// Ziehen in eine Zelle
await box.fill('risotto')
await page.waitForTimeout(400)
const ziel = page.locator('.cell').first()
const b = await ziel.boundingBox()
await page.locator('.search-hit').first().dragTo(ziel, { targetPosition: { x: b.width / 2, y: b.height / 2 } })
await page.waitForTimeout(700)
const inZelle = await page.evaluate(() => document.querySelector('.cell .chat-panel')?.getAttribute('data-chat-id'))
log('in die erste Zelle gezogen:', inZelle)
check(inZelle === 'kochen', 'Treffer in eine Zelle gezogen')
await page.screenshot({ path: join(out, '2-geoeffnet.png') })

// Leeren: Chatliste ist wieder da
await page.locator('.search-clear').click()
await page.waitForTimeout(200)
check((await page.locator('.chat-list .chat-item').count()) === 3, 'Leeren zeigt wieder alle Chats')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
