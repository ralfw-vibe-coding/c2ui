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
check(/4 Nachrichten, 1 Ast/.test((await leiste.locator('.board-group-size').getAttribute('title')) ?? ''), 'die Leiste nennt auch den Ast in der Strecke')
await page.screenshot({ path: join(out, '1-markiert.png') })

// Vor dem Gruppieren einen Turn öffnen – die Markierung darf danach nicht wandern
await zeile('Nachricht 3').click()
await page.waitForTimeout(700)
const markierung = async () => ((await page.locator('.board-row.active').allInnerTexts())[0] ?? '').replace(/\s+/g, ' ')
const vorher = await markierung()
log('markiert vor dem Gruppieren:', vorher.slice(0, 30))
check(/Nachricht 3 /.test(vorher), 'Nachricht 3 ist markiert')
await zeile('Nachricht 3').click({ modifiers: ['Shift'] })
await zeile('Nachricht 6').click({ modifiers: ['Shift'] })
await page.waitForTimeout(300)

// Benennen und gruppieren – die Gruppe entsteht offen, nichts verschiebt sich
await leiste.locator('input').fill('Bildbeschaffung')
await leiste.locator('.btn.primary').click()
await page.waitForTimeout(500)
const offenGleich = await zeilen()
log('nach dem Anlegen:', offenGleich.join(' | '))
check(offenGleich.length === 12, 'die Gruppe ist offen: alle Zeilen plus Kopfzeile')
check(/Bildbeschaffung/.test(offenGleich[2]), 'die Kopfzeile steht über der Strecke')
const danach = await markierung()
log('markiert nach dem Gruppieren:', danach.slice(0, 30))
check(/Nachricht 3 /.test(danach), 'die Markierung bleibt, wo sie war')

// Zuklappen entscheidet man selbst
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(500)
const nachher = await zeilen()
log('zugeklappt:', nachher.join(' | '))
check(nachher.length === 7, 'zugeklappt bleiben sieben Zeilen')
check(/Bildbeschaffung/.test(await markierung()), 'die markierte Stelle steckt nun in der Gruppe – die Zeile ist markiert')
check(/Bildbeschaffung/.test(nachher[2]) && /\b4\b/.test(nachher[2]) && /\b1\b/.test(nachher[2]), 'die Gruppenzeile nennt Namen und Umfang')
const umfang = zeile('Bildbeschaffung').locator('.board-group-size')
check((await umfang.locator('.icon').count()) === 2, 'Umfang steht mit Symbolen da (Nachrichten und Äste)')
check(/4 Nachrichten, 1 Ast/.test((await umfang.getAttribute('title')) ?? ''), 'ausgeschrieben steht es im Tooltip')
check(!nachher.some((z) => /Nachricht 4\b/.test(z)), 'was in der Gruppe liegt, ist weg')
check(!nachher.some((z) => /Welche Motive/.test(z)), 'der Ast darin ebenfalls')
check((await page.locator('.board-run .board-folder-mark').count()) === 1, 'auf der Spur steht eine Ordnermarke')
check((await page.locator('.board-folder-bg').count()) === 0, 'und kein Fleck in der Hintergrundfarbe darüber')
// Die Spur läuft nicht durch die Marke, sondern hat dort eine Lücke (Zeile 3 → Mitte bei y = 75).
const striche = await page.evaluate(() =>
  [...document.querySelectorAll('.board-graph line')]
    .filter((l) => Math.round(+l.getAttribute('x1')) === 14)
    .map((l) => [+l.getAttribute('y1'), +l.getAttribute('y2')])
)
log('Striche der Wurzelspur:', JSON.stringify(striche))
check(striche.length === 2, 'die Spur besteht aus zwei Strichen')
check(striche.every(([a, b]) => b < 75 - 6 || a > 75 + 6), 'keiner davon läuft durch die Marke')
await page.screenshot({ path: join(out, '2-zugeklappt.png') })

// Gespeichert wird beim Baum, nicht im Browser
const datei = join(userData, 'boards', 'haus.json')
check(existsSync(datei), 'die Gruppe liegt beim Baum auf der Platte')
const gespeichert = JSON.parse(readFileSync(datei, 'utf8'))
log('gespeichert:', JSON.stringify(gespeichert))
check(gespeichert[0]?.label === 'Bildbeschaffung' && gespeichert[0]?.closed === true, 'mit Namen und zugeklappt')

// Wieder aufklappen: Kopfzeile, Klammer, Ast wieder da
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

// Geschachtelte Gruppe: erst die äußere wieder öffnen, dann darin eine engere Strecke markieren
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(400)
await zeile('Nachricht 4').click({ modifiers: ['Shift'] })
await zeile('Nachricht 5').click({ modifiers: ['Shift'] })
await page.waitForTimeout(300)
await leiste.locator('input').fill('Motive')
await leiste.locator('.btn.primary').click()
await page.waitForTimeout(500)
const verschachtelt = await zeilen()
log('mit innerer Gruppe:', verschachtelt.join(' | '))
check(verschachtelt.length === 13, 'zwei Kopfzeilen plus alle Zeilen')
check(/Motive/.test(verschachtelt[4]), 'die innere Kopfzeile steht vor Nachricht 4')
// Die Schachtelung zeigt sich an den Klammern: die innere steht weiter rechts.
const klammern = await page.locator('.board-group path').evaluateAll((ns) =>
  // Je Gruppe eine Klammer („M x …“) und ein Ordner; nur die Klammern zählen.
  ns.map((n) => /^M\s*([\d.]+)/.exec(n.getAttribute('d') ?? '')?.[1]).filter(Boolean).map(Number)
)
log('Klammern bei x =', JSON.stringify(klammern))
check(klammern.length === 2 && klammern[1] > klammern[0], 'zwei Klammern, die innere weiter rechts')
await page.screenshot({ path: join(out, '4-geschachtelt.png') })

// Innere zuklappen: die äußere bleibt offen
await zeile('Motive').click()
await page.waitForTimeout(500)
const innenZu = await zeilen()
log('innere zugeklappt:', innenZu.join(' | '))
// Zwei Nachrichten und der Ast, der in ihnen abzweigt, machen drei Zeilen weniger.
check(innenZu.length === 10, 'drei Zeilen weniger (zwei Nachrichten und der Ast darin)')
check(!innenZu.some((z) => /Welche Motive/.test(z)), 'der Ast steckt in der inneren Gruppe')
check(/Bildbeschaffung/.test(innenZu[2]) && /Motive/.test(innenZu[4]), 'äußere Kopfzeile und innere Gruppenzeile')
check(!innenZu.some((z) => /Nachricht 4 /.test(z)), 'die inneren Nachrichten sind weg')

// Äußere zuklappen: die innere verschwindet mit
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(500)
const beideZu = await zeilen()
log('äußere zugeklappt:', beideZu.join(' | '))
check(beideZu.length === 7, 'nur noch die äußere Zeile')
check(!beideZu.some((z) => /Motive/.test(z)), 'die innere Gruppe steckt darin')
await zeile('Bildbeschaffung').click()
await page.waitForTimeout(400)
await zeile('Motive').hover()
await zeile('Motive').locator('.board-group-drop').click()
await page.waitForTimeout(400)
check((await page.locator('.board-row.group-head').count()) === 1, 'innere Gruppe aufgelöst')

// Ein Ast, der ganz in einer zugeklappten Gruppe steckt: Kante und Zusammenführung müssen am
// Ordner hängen, nicht an einer Zeile, die es nicht gibt (sonst Linien nach oben ins Nichts).
await zeile('Welche Motive').click({ modifiers: ['Shift'] })
await page.waitForTimeout(300)
await page.locator('.board-pick-bar input').fill('Motivsuche')
await page.locator('.board-pick-bar .btn.primary').click()
await page.waitForTimeout(400)
await zeile('Motivsuche').click()
await page.waitForTimeout(500)
const astZu = await zeilen()
log('Ast zugeklappt:', astZu.join(' | '))
check(!astZu.some((z) => /Welche Motive/.test(z)), 'die Nachricht des Asts steckt in der Gruppe')
const ordnerOben = parseFloat(await zeile('Motivsuche').evaluate((n) => n.style.top)) + 15
const graph = await page.evaluate(() => ({
  kanten: [...document.querySelectorAll('.board-edge')].map((p) => p.getAttribute('d')),
  linien: [...document.querySelectorAll('.board-graph line')].map((l) => ({
    x: Math.round(+l.getAttribute('x1')),
    y1: +l.getAttribute('y1'),
    y2: +l.getAttribute('y2')
  }))
}))
log('Graph:', JSON.stringify(graph), 'Ordner bei y =', ordnerOben)
// Die Kante beginnt an der Abzweigstelle im Ursprung und führt über die Spur des Asts zum Ordner.
const beginn = /^M [0-9.]+ ([0-9.]+)/.exec(graph.kanten[0] ?? '')
const astLinien = graph.linien.filter((l) => l.x !== 14)
check(!!beginn, 'es gibt eine Kante aus dem Ursprung')
check(astLinien.length > 0, 'und ein Stück Spur beim Ast')
check(astLinien.every((l) => l.y1 >= +beginn[1]), 'nichts auf der Spur des Asts läuft über die Abzweigstelle hinaus nach oben')
check(Math.abs(Math.max(...astLinien.map((l) => l.y2)) - ordnerOben) <= 12, 'und sie endet am Ordner')

// Auflösen
await zeile('Motivsuche').hover()
await zeile('Motivsuche').locator('.board-group-drop').click()
await page.waitForTimeout(400)
await zeile('Bildbeschaffung').hover()
await zeile('Bildbeschaffung').locator('.board-group-drop').click()
await page.waitForTimeout(400)
check((await page.locator('.board-row').count()) === 11, 'aufgelöst: wieder elf Zeilen')
check(!existsSync(datei) || JSON.parse(readFileSync(datei, 'utf8')).length === 0, 'und nichts mehr gespeichert')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
