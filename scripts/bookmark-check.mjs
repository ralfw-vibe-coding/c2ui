// Prüfung ohne Modellaufruf: Lesezeichen an Stellen im Verlauf und das Inhaltsverzeichnis am Board.
// Aufruf: npm run build && node scripts/bookmark-check.mjs [ausgabe-verzeichnis]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/bookmarks'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })

const min = (m) => Date.UTC(2026, 0, 1, 8) + m * 60_000
const chat = (id, title, created, parent, turn) => ({
  id, title, agent: 'claude', cwd: root, permissionMode: 'default', sessionId: id, sessionStarted: true,
  createdAt: min(created), updatedAt: min(created + 50),
  ...(parent ? { forkFrom: { chatId: parent, title: parent, at: { turn } } } : {})
})
writeFileSync(join(userData, 'chats.json'), JSON.stringify([chat('haus', 'Hausarbeit', 0), chat('ast', 'Quellenlage', 40, 'haus', 2)]))
writeFileSync(join(userData, 'transcripts', 'haus.json'), JSON.stringify([
  { type: 'user', id: 'u1', ts: min(1), text: 'Hilf mir bei der Gliederung.' },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Das Bundestagsarchiv hat die Protokolle aller Sitzungen.\n\nDaneben gibt es die Drucksachen.' }] },
  { type: 'user', id: 'u2', ts: min(10), text: 'Und die Ausschüsse?' },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: 'Ausschussprotokolle sind oft nicht öffentlich.' }] }
]))
writeFileSync(join(userData, 'transcripts', 'ast.json'), JSON.stringify([
  { type: 'notice', id: 'n', text: 'Abgezweigt aus „Hausarbeit“' },
  { type: 'user', id: 'b1', ts: min(42), text: 'Welche Quellen sind zitierfähig?' },
  { type: 'assistant', id: 'ba1', blocks: [{ type: 'text', text: 'Amtliche Veröffentlichungen gehen immer.' }] }
]))

const log = (...x) => console.log('[lesezeichen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item', { hasText: 'Hausarbeit' }).click()
await page.locator('.chat-panel').waitFor()

/** Wort im Verlauf doppelklicken und daraus ein Lesezeichen setzen. */
async function lesezeichenAus(wort) {
  const p = await page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.transcript-inner'), NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(w)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + w.length)
      const b = r.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    return null
  }, wort)
  if (!p) throw new Error(`„${wort}“ nicht gefunden`)
  await page.mouse.dblclick(p.x, p.y)
  await page.locator('.quote-pill').waitFor()
  await page.locator('.quote-pill button', { hasText: 'Lesezeichen' }).click()
  await page.waitForTimeout(400)
}

// Aus einer Markierung
await lesezeichenAus('Bundestagsarchiv')
check((await page.locator('.bookmark-pin').count()) === 1, 'die Marke steht im Text')
const datei = join(userData, 'bookmarks', 'haus.json')
check(existsSync(datei), 'gespeichert wird neben dem Verlauf')
log('gespeichert:', readFileSync(datei, 'utf8').slice(0, 160))
check(JSON.parse(readFileSync(datei, 'utf8'))[0].quote === 'Bundestagsarchiv', 'mit der markierten Stelle als Zitat')

// Beschriften
await page.locator('.bookmark-pin').click()
await page.locator('.bookmark-note input').waitFor()
check((await page.locator('.bookmark-note .comment-quote').innerText()).includes('Bundestagsarchiv'), 'die Karte zeigt die Stelle')
await page.locator('.bookmark-note input').fill('Quellen im Archiv')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
check(JSON.parse(readFileSync(datei, 'utf8'))[0].label === 'Quellen im Archiv', 'die Beschriftung ist gespeichert')
check((await page.locator('.bookmark-pin').getAttribute('title')) === 'Quellen im Archiv', 'und steht im Tooltip')

// Ohne Markierung: Knopf am überfahrenen Eintrag
await page.locator('.unit[data-item-id="u2"]').hover()
await page.locator('.comment-add.bookmark').waitFor()
await page.locator('.comment-add.bookmark').click()
await page.waitForTimeout(400)
check((await page.locator('.bookmark-pin').count()) === 2, 'auch ohne Markierung geht es')
check(JSON.parse(readFileSync(datei, 'utf8')).length === 2, 'zwei Lesezeichen gespeichert')
await page.screenshot({ path: join(out, '1-marken.png') })

// Eines im Nebenchat, damit das Verzeichnis den ganzen Baum zeigt
await page.evaluate(() => window.api.addBookmark('ast', { itemId: 'b1', label: 'Zitierfähigkeit' }))
await page.waitForTimeout(300)

// Inhaltsverzeichnis am Board
const item = page.locator('.chat-item', { hasText: 'Hausarbeit' })
await item.hover()
await item.locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
await page.waitForTimeout(400)
const toc = await page.locator('.board-toc-item').allInnerTexts()
log('Verzeichnis:', toc.map((t) => t.replace(/\s+/g, ' ')).join(' | '))
check(toc.length === 3, 'drei Einträge aus beiden Chats')
check(/Quellen im Archiv/.test(toc[0]), 'die eigene Beschriftung steht vorn')
check(/Und die Ausschüsse/.test(toc[1]), 'ohne Beschriftung steht die Nachricht da')
check(/Zitierfähigkeit/.test(toc[2]), 'auch das Lesezeichen aus dem Nebenchat')
await page.screenshot({ path: join(out, '2-verzeichnis.png') })

// Klick springt an die Stelle
await page.locator('.board-toc-item', { hasText: 'Zitierfähigkeit' }).click()
await page.waitForTimeout(900)
const offen = await page.locator('.chat-panel').evaluateAll((ns) => ns.map((n) => n.dataset.chatId))
log('offene Chats:', offen.join(', '))
check(offen.includes('ast'), 'der Klick öffnet den Chat des Lesezeichens')

// Entfernen
await page.locator('.board-toc li', { hasText: 'Quellen im Archiv' }).hover()
await page.locator('.board-toc li', { hasText: 'Quellen im Archiv' }).locator('.board-toc-drop').click()
await page.waitForTimeout(400)
check((await page.locator('.board-toc-item').count()) === 2, 'entfernt verschwindet es aus dem Verzeichnis')
check(JSON.parse(readFileSync(datei, 'utf8')).length === 1, 'und aus der Ablage')

// Übersteht den Neustart
await page.reload()
await page.locator('.board-row').first().waitFor()
await page.waitForTimeout(500)
check((await page.locator('.board-toc-item').count()) === 2, 'die Lesezeichen überstehen den Neustart')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
