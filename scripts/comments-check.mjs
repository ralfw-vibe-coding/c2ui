// Prüfung ohne Modellaufruf: Notizen am Rand – anlegen (aus einer Markierung), ändern, löschen, bleiben.
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
const chats = [{ id: 'haus', title: 'Hausarbeit', agent: 'claude', cwd: root, permissionMode: 'default', sessionId: 'haus', sessionStarted: true, createdAt: 1, updatedAt: 2 }]
const tr = [
  { type: 'user', id: 'u1', ts: 1, text: 'Welche Quellen gibt es zum Bundestag?' },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Im Bundestagsarchiv liegen die Protokolle aller Sitzungen. Daneben gibt es die Drucksachen.' }] },
  { type: 'user', id: 'u2', ts: 2, text: 'Und die Ausschüsse?' },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: 'Ausschussprotokolle sind oft nicht öffentlich.' }] }
]
writeFileSync(join(userData, 'transcripts', 'haus.json'), JSON.stringify(tr))
writeFileSync(join(userData, 'chats.json'), JSON.stringify(chats))
const log = (...x) => console.log('[notizen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
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
check((await page.locator('.comment-note').count()) === 1, 'Notiz angelegt und zum Schreiben offen')
await page.locator('.comment-note.editing textarea').fill('Signatur heraussuchen')
await page.locator('.comment-note .btn.primary').click()
await page.waitForTimeout(300)
const text = await page.locator('.comment-note').first().innerText()
log('Notiz:', text.replace(/\s+/g, ' '))
check(/Signatur heraussuchen/.test(text) && /Bundestagsarchiv/.test(text), 'Notiz zeigt Text und Zitat')
check((await page.evaluate(() => CSS.highlights?.has('c2-comment'))) === true, 'markierte Stelle ist unterlegt')

// Zweite Notiz an anderer Stelle: beide stehen untereinander, in Reihenfolge des Texts
await notizAus('Ausschussprotokolle')
await page.locator('.comment-note.editing textarea').fill('Stimmt das wirklich?')
await page.keyboard.press('Meta+Enter')
await page.waitForTimeout(400)
const tops = await page.evaluate(() => [...document.querySelectorAll('.comment-note')].map((n) => Math.round(n.getBoundingClientRect().top)))
const texte = await page.locator('.comment-note').allInnerTexts()
log('Notizen:', texte.map((t) => t.replace(/\s+/g, ' ').slice(0, 40)), '| Höhen:', tops)
check(texte.length === 2 && tops[0] < tops[1], 'zweite Notiz steht weiter unten')
check(/Stimmt das/.test(texte[1]), '⌘↩ speichert')
await page.screenshot({ path: join(out, '1-notizen.png') })

// Ändern
await page.locator('.comment-note').first().click()
await page.locator('.comment-note.editing textarea').fill('Signatur im Lesesaal erfragen')
await page.locator('.comment-note .btn.primary').click()
await page.waitForTimeout(300)
check(/Lesesaal/.test(await page.locator('.comment-note').first().innerText()), 'Notiz geändert')

// Bleibt nach Neuladen
await page.waitForTimeout(500)
await page.reload()
await page.locator('.chat-panel').waitFor()
await page.locator('.comment-note').first().waitFor()
await page.waitForTimeout(400)
check((await page.locator('.comment-note').count()) === 2, 'Notizen überstehen den Neustart')
check(/Lesesaal/.test((await page.locator('.comment-note').allInnerTexts()).join(' ')), 'geänderter Text ist gespeichert')

// Löschen
await page.locator('.comment-note').first().click()
await page.locator('.comment-delete').click()
await page.waitForTimeout(300)
check((await page.locator('.comment-note').count()) === 1, 'Notiz gelöscht')
// Abbrechen einer neuen Notiz lässt nichts zurück
await notizAus('Drucksachen')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check((await page.locator('.comment-note').count()) === 1, 'abgebrochene Notiz verschwindet')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
