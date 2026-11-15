// Prüfung ohne Modellaufruf: Gruppen im Diskursboard – Strecke markieren, benennen, zu- und aufklappen.
// Aufruf: npm run build && node scripts/board-group-check.mjs [ausgabe-verzeichnis]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/board-gruppen'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const min = (m) => Date.UTC(2026, 0, 1, 8) + m * 60_000
const chat = (id, title, created, parent, turn) => ({
  id, title, agent: 'claude', cwd: root, permissionMode: 'default', sessionId: id, sessionStarted: true,
  createdAt: min(created), updatedAt: min(created + 50),
  ...(parent ? { forkFrom: { chatId: parent, title: parent, at: { turn } } } : {})
})
const u = (id, m, text) => ({ type: 'user', id, ts: min(m), text })
const a = (id) => ({ type: 'assistant', id, blocks: [{ type: 'text', text: `Antwort ${id}` }] })

// Wurzel mit zehn Nachrichten; nach der vierten zweigt ein Ast ab.
const chats = [chat('haus', 'Hausarbeit', 0), chat('ast', 'Bildvarianten', 40, 'haus', 4)]
writeFileSync(join(userData, 'transcripts', 'haus.json'), JSON.stringify(
  Array.from({ length: 10 }, (_, i) => [u(`h${i + 1}`, i * 5, `Nachricht ${i + 1}`), a(`ha${i + 1}`)]).flat()
))
writeFileSync(join(userData, 'transcripts', 'ast.json'), JSON.stringify([
  { type: 'notice', id: 'n', text: 'Abgezweigt aus „Hausarbeit“' }, u('b1', 22, 'Welche Motive?'), a('ba1')
]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))

const log = (...x) => console.log('[gruppen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
const item = page.locator('.chat-item', { hasText: 'Hausarbeit' })
await item.hover()
await item.locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
await page.waitForTimeout(300)

const zeilen = () =>
  page.locator('.board-row').evaluateAll((ns) =>
    ns.map((n) => ({ top: parseFloat(n.style.top) || 0, text: n.innerText.replace(/\s+/g, ' ') }))
      .sort((x, y) => x.top - y.top).map((z) => z.text)
  )
const zeile = (t) => page.locator('.board-row', { hasText: t }).first()

// Alles einzeln sichtbar? (11 Nachrichten; nichts automatisch gerafft, weil die Strecken kurz sind)
log('vorher:', (await zeilen()).join(' | '))
check((await page.locator('.board-row').count()) === 11, 'elf Zeilen, nichts gerafft')

// Strecke markieren: ⇧-Klick auf Nachricht 3, ⇧-Klick auf Nachricht 6 (öffnet keinen Chat)
await zeile('Nachricht 3').click({ modifiers: ['Shift'] })
await page.waitForTimeout(200)
check((await page.locator('.cell').count()) === 1, '⇧-Klick öffnet keinen Chat')
await zeile('Nachricht 6').click({ modifiers: ['Shift'] })
await page.waitForTimeout(300)
check((await page.locator('.board-row.picked').count()) === 4, 'vier Zeilen markiert')
const leiste = page.locator('.board-pick-bar')
check((await leiste.count()) === 1, 'die Leiste zum Benennen erscheint')
check((await leiste.locator('input').getAttribute('placeholder')) === 'Nachricht 3', 'der Name wird aus der ersten Nachricht vorgeschlagen')
await page.screenshot({ path: join(out, '1-markiert.png') })

// Benennen und gruppieren – zugeklappt, Ast verschwindet mit
await leiste.locator('input').fill('Bildbeschaffung')
await leiste.locator('.btn.primary').click()
await page.waitForTimeout(500)
const nachher = await zeilen()
log('zugeklappt:', nachher.join(' | '))
check(nachher.length === 7, 'aus elf Zeilen werden sieben')
check(/Bildbeschaffung/.test(nachher[2]) && /4 Nachrichten/.test(nachher[2]) && /1 Ast/.test(nachher[2]), 'die Gruppenzeile nennt Namen, Umfang und den Ast darin')
check(!nachher.some((z) => /Nachricht 4\b/.test(z)), 'was in der Gruppe liegt, ist weg')
check(!nachher.some((z) => /Welche Motive/.test(z)), 'der Ast darin ebenfalls')
check((await page.locator('.board-folder-bg').count()) === 1, 'auf der Spur steht ein Ordner')
await page.screenshot({ path: join(out, '2-zugeklappt.png') })

// Gespeichert wird beim Baum, nicht im Browser
const datei = join(userData, 'boards', 'haus.json')
check(existsSync(datei), 'die Gruppe liegt beim Baum auf der Platte')
const gespeichert = JSON.parse(readFileSync(datei, 'utf8'))
log('gespeichert:', JSON.stringify(gespeichert))
check(gespeichert[0]?.label === 'Bildbeschaffung' && gespeichert[0]?.closed === true, 'mit Namen und zugeklappt')

// Aufklappen: Kopfzeile, Klammer, Ast wieder da
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(400)
const offen = await zeilen()
log('aufgeklappt:', offen.join(' | '))
check(offen.length === 12, 'Kopfzeile plus alle Zeilen')
check(/Bildbeschaffung/.test(offen[2]), 'die Kopfzeile steht über der Strecke')
check(offen.some((z) => /Welche Motive/.test(z)), 'der Ast ist wieder da')
check((await page.locator('.board-group path').count()) >= 1, 'die Klammer ist gezeichnet')
await page.screenshot({ path: join(out, '3-aufgeklappt.png') })

// Übersteht den Neustart und lässt sich wieder zuklappen
await page.reload()
await page.locator('.board-row').first().waitFor()
await page.waitForTimeout(500)
check((await page.locator('.board-row').count()) === 12, 'nach dem Neuladen weiter aufgeklappt')
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(400)
check((await page.locator('.board-row').count()) === 7, 'und wieder zuklappbar')

// Auflösen
await zeile('Bildbeschaffung').hover()
await zeile('Bildbeschaffung').locator('.board-group-drop').click()
await page.waitForTimeout(400)
check((await page.locator('.board-row').count()) === 11, 'aufgelöst: wieder elf Zeilen')
check(!existsSync(datei) || JSON.parse(readFileSync(datei, 'utf8')).length === 0, 'und nichts mehr gespeichert')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
