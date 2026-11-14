// Prüfung ohne Modellaufruf: Notizen zu Stellen im Verlauf – anlegen (aus einer Markierung), ändern, löschen, bleiben.
// Die Marke steht hinter der markierten Stelle im Text, das Feld bleibt immer sichtbar.
// Aufruf: npm run build && node scripts/comments-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/comments'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const chats = [
  { id: 'haus', title: 'Hausarbeit', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'haus', sessionStarted: true, createdAt: 1, updatedAt: 2 },
  { id: 'anderes', title: 'Anderer Chat', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'anderes', sessionStarted: true, createdAt: 3, updatedAt: 4 }
]
const tr = [
  { type: 'user', id: 'u1', ts: 1, text: 'Welche Quellen gibt es zum Bundestag?' },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Im Bundestagsarchiv liegen die Protokolle aller Sitzungen. Daneben gibt es die Drucksachen.' }] },
  { type: 'user', id: 'u2', ts: 2, text: 'Und die Ausschüsse?' },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: 'Ausschussprotokolle sind oft nicht öffentlich.' }] }
]
writeFileSync(join(userData, 'transcripts', 'haus.json'), JSON.stringify(tr))
writeFileSync(join(userData, 'transcripts', 'anderes.json'), JSON.stringify([{ type: 'user', id: 'x1', ts: 1, text: 'Etwas ganz anderes.' }]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...x) => console.log('[notizen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
const chatItem = (titel) => page.locator('.chat-item', { hasText: titel })
await chatItem('Hausarbeit').click()
await page.locator('.chat-panel').waitFor()

/** Stelle des Worts im Verlauf finden (Mitte des Worts, nicht des Absatzes). */
async function stelleVon(wort) {
  return page.evaluate((w) => {
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
}

/** Wort im Verlauf markieren (Doppelklick) und die Notiz aus dem Overlay anlegen. */
async function notizAus(wort) {
  const p = await stelleVon(wort)
  if (!p) throw new Error(`„${wort}“ nicht im Verlauf gefunden`)
  await page.mouse.dblclick(p.x, p.y)
  await page.locator('.quote-pill').waitFor()
  await page.locator('.quote-pill button', { hasText: 'Notiz' }).click()
  await page.locator('.comment-note.editing textarea').waitFor()
}

await notizAus('Bundestagsarchiv')
check((await page.locator('.comment-note.editing').count()) === 1, 'Notiz angelegt und zum Schreiben offen')
await page.locator('.comment-note.editing textarea').fill('Signatur heraussuchen')
await page.locator('.comment-note .btn.primary').click()
await page.waitForTimeout(300)
const text = await page.locator('.comment-note').first().innerText()
log('Notiz:', text.replace(/\s+/g, ' '))
check(/Signatur heraussuchen/.test(text) && /Bundestagsarchiv/.test(text), 'Notiz zeigt Text und Zitat')
// Escape klappt ein, es bleibt die Marke im Text
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check((await page.locator('.comment-note').count()) === 0 && (await page.locator('.comment-pin').count()) === 1, 'Escape klappt ein, die Marke bleibt')
// Die Marke steht hinter der markierten Stelle, nicht am Rand der Zelle
const wort = await stelleVon('Bundestagsarchiv')
const marke = await page.locator('.comment-pin').first().boundingBox()
const innen = await page.locator('.transcript-inner').boundingBox()
log('Wort bei', Math.round(wort.x), '| Marke bei', Math.round(marke.x), '| Innenbreite bis', Math.round(innen.x + innen.width))
check(Math.abs(marke.y + marke.height / 2 - wort.y) < 14, 'Marke steht auf der Höhe der Stelle')
check(marke.x > wort.x && marke.x < innen.x + innen.width - 40, 'Marke steht hinter der Stelle im Text, nicht am Zellenrand')
await page.locator('.comment-pin').click()
await page.waitForTimeout(200)
check((await page.locator('.comment-note').count()) === 1, 'Klick auf die Marke klappt die Notiz auf')
check((await page.locator('.comment-note button[title^="Schließen"]').count()) === 1, 'Notiz hat ein x statt eines Knopfs „Schließen“')
check((await page.evaluate(() => CSS.highlights?.has('c2-comment'))) === true, 'markierte Stelle ist unterlegt')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Zweite Notiz an anderer Stelle: beide stehen untereinander, in Reihenfolge des Texts
await notizAus('Ausschussprotokolle')
await page.locator('.comment-note.editing textarea').fill('Stimmt das wirklich?')
await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(400)
// Das Feld liegt ganz im sichtbaren Teil der Zelle, obwohl die Stelle weit unten steht
const feld = await page.locator('.comment-note').boundingBox()
const sicht = await page.locator('.transcript').boundingBox()
log('Feld', Math.round(feld.y), '–', Math.round(feld.y + feld.height), '| sichtbar', Math.round(sicht.y), '–', Math.round(sicht.y + sicht.height))
check(feld.y >= sicht.y - 1 && feld.y + feld.height <= sicht.y + sicht.height + 1, 'Notiz unten im Verlauf bleibt ganz sichtbar')
check(feld.x >= sicht.x - 1 && feld.x + feld.width <= sicht.x + sicht.width + 1, 'Notiz steht nicht über den Rand hinaus')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const tops = await page.evaluate(() => [...document.querySelectorAll('.comment-pin')].map((n) => Math.round(n.getBoundingClientRect().top)))
const titel = await page.locator('.comment-pin').evaluateAll((ns) => ns.map((n) => n.title))
log('Symbole:', titel, '| Höhen:', tops)
check(titel.length === 2 && tops[0] < tops[1], 'zweite Marke steht weiter unten')
check(/Stimmt das/.test(titel[1]), '⌘↩ speichert')
await page.screenshot({ path: join(out, '1-notizen.png') })

// Ändern: aufklappen, auf den Text klicken
await page.locator('.comment-pin').first().click()
await page.waitForTimeout(150)
await page.locator('.comment-text').click()
await page.locator('.comment-note.editing textarea').fill('Signatur im Lesesaal erfragen')
await page.locator('.comment-note .btn.primary').click()
await page.waitForTimeout(300)
check(/Lesesaal/.test(await page.locator('.comment-note').first().innerText()), 'Notiz geändert')
// Seitenleiste zeigt die Anzahl
check(/2/.test(await page.locator('.chat-notes').first().innerText()), 'Seitenleiste zeigt die Zahl der Notizen')

// Bleibt nach Neuladen
await page.waitForTimeout(500)
await page.reload()
await page.locator('.chat-panel').waitFor()
await page.locator('.comment-pin').first().waitFor()
await page.waitForTimeout(400)
check((await page.locator('.comment-pin').count()) === 2, 'Notizen überstehen den Neustart')
check(/Lesesaal/.test((await page.locator('.comment-pin').evaluateAll((ns) => ns.map((n) => n.title))).join(' ')), 'geänderter Text ist gespeichert')

// Löschen
await page.locator('.comment-pin').first().click()
await page.locator('.comment-delete').click()
await page.waitForTimeout(300)
check((await page.locator('.comment-pin').count()) === 1, 'Notiz gelöscht')
// Abbrechen einer neuen Notiz lässt nichts zurück
await notizAus('Drucksachen')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
log('nach Abbruch: Marken', await page.locator('.comment-pin').count(), '| Felder', await page.locator('.comment-note').count(), '| gespeichert', (await page.evaluate(() => window.api.comments('haus'))).length)
check((await page.locator('.comment-pin').count()) === 1 && (await page.locator('.comment-note').count()) === 0, 'abgebrochene Notiz verschwindet')

// Beim Wechsel zwischen Chats stehen die Marken sofort da (eine Zelle, Seitenleiste)
await chatItem('Anderer Chat').click()
await page.waitForTimeout(250)
check((await page.locator('.comment-pin').count()) === 0, 'anderer Chat zeigt keine Marken')
await chatItem('Hausarbeit').click()
await page.waitForTimeout(600)
check((await page.locator('.comment-pin').count()) === 1, 'zurück im Chat: Marke steht gleich wieder da')

// Auch in einer schmalen Zelle
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 800))
await page.waitForTimeout(600)
const schmal = await page.locator('.comment-pin').first().boundingBox()
const zelle = await page.locator('.transcript').boundingBox()
log('schmal: Marke bei', Math.round(schmal?.x ?? -1), '| Zelle', Math.round(zelle.x), '–', Math.round(zelle.x + zelle.width))
check(!!schmal && schmal.x > zelle.x && schmal.x + schmal.width <= zelle.x + zelle.width + 1, 'Marke bleibt in der schmalen Zelle sichtbar')
await page.locator('.comment-pin').first().click()
await page.waitForTimeout(300)
const feld2 = await page.locator('.comment-note').boundingBox()
const sicht2 = await page.locator('.transcript').boundingBox()
check(feld2.x >= sicht2.x - 1 && feld2.x + feld2.width <= sicht2.x + sicht2.width + 1, 'Notizfeld passt auch in die schmale Zelle')
await page.screenshot({ path: join(out, '2-schmal.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
