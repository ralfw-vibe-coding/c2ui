// Prüfung ohne Modellaufruf: Abzweigen ohne Markierung – am Ende jeder Antwort im Chat
// und an jeder Zeile im Diskursboard.
// Aufruf: npm run build && node scripts/fork-here-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/fork-here'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
const now = Date.now()
const absatz = (t) => ({ type: 'text', text: t })
writeFileSync(join(userData, 'transcripts', 'src.json'), JSON.stringify([
  { type: 'user', id: 'u1', text: 'Erkläre mir den Bundestag.', ts: now - 3000 },
  { type: 'assistant', id: 'a1', blocks: [absatz('Der Bundestag ist das Parlament.')] },
  { type: 'turn', id: 't1', durationMs: 2000, isError: false, model: 'sonnet' },
  { type: 'user', id: 'u2', text: 'Und der Bundesrat?', ts: now - 2000 },
  { type: 'assistant', id: 'a2', blocks: [absatz('Im Bundesrat sitzen die Länder.')] },
  { type: 'turn', id: 't2', durationMs: 2000, isError: false, model: 'sonnet' },
  { type: 'user', id: 'u3', text: 'Wer schreibt die Gesetze?', ts: now - 1000 },
  { type: 'assistant', id: 'a3', blocks: [absatz('Den Entwurf macht meist die Regierung.')] },
  { type: 'turn', id: 't3', durationMs: 2000, isError: false, model: 'sonnet' }
]))
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'src', title: 'Erkläre mir den Bundestag', cwd: root, agent: 'claude', permissionMode: 'default',
    sessionId: 'src', sessionStarted: false, createdAt: now - 9000, updatedAt: now - 9000 }
]))

const log = (...x) => console.log('[abzweigen]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }
const chats = () => JSON.parse(readFileSync(join(userData, 'chats.json'), 'utf8'))
// Transkripte werden verzögert geschrieben – deshalb über die App lesen, nicht aus der Datei.
const transcript = (id) => page.evaluate((x) => window.api.transcript(x), id)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').first().click()
await page.locator('.chat-panel').waitFor()
await page.waitForTimeout(500)

// 1. An jedem Turn-Ende ein Knopf, der erst beim Überfahren sichtbar wird
const fuss = page.locator('.msg-turn')
check((await fuss.count()) === 3, 'jede Antwort hat eine Fußzeile')
check((await page.locator('.msg-turn .turn-fork').count()) === 3, 'und dort einen Knopf zum Abzweigen')
// Die letzte Fußzeile steht unten im Bild – dorthin muss nicht gescrollt werden.
const letzteFuss = fuss.last()
const letzterKnopf = page.locator('.msg-turn .turn-fork').last()
const deckkraft = async () => letzterKnopf.evaluate((e) => getComputedStyle(e).opacity)
check((await deckkraft()) === '0', 'der Knopf ist unsichtbar, solange die Maus woanders ist')
const kasten = await letzteFuss.boundingBox()
await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2)
await page.waitForTimeout(200)
check((await deckkraft()) === '1', 'beim Überfahren der Zeile erscheint er')
await page.screenshot({ path: join(out, '1-turnfuss.png') })

// 2. Klick zweigt ab: neue Zelle daneben, nichts gesendet
await page.locator('.msg-turn .turn-fork').first().click()
await page.waitForTimeout(600)
const nachher = chats()
const ast = nachher.find((c) => c.id !== 'src')
log('Ast:', JSON.stringify(ast && { title: ast.title, at: ast.forkFrom?.at }))
check(nachher.length === 2 && !!ast, 'es gibt einen Nebenchat')
check(ast?.forkFrom?.chatId === 'src', 'er zweigt vom Ursprung ab')
check(ast?.forkFrom?.at?.itemId === 't1' && ast?.forkFrom?.at?.turn === 1, 'und zwar nach der ersten Nachricht, nicht am Ende')
check(ast?.title === 'Neuer Chat', 'der Titel bleibt offen – die erste eigene Nachricht benennt ihn')
check(!ast?.forkFrom?.at?.quote, 'ohne Markierung gibt es kein Zitat')
check((await page.locator('.cell').count()) === 2, 'der Ast steht in einer neuen Zelle daneben')
const astVerlauf = await transcript(ast.id)
const notiz = astVerlauf.find((i) => i.type === 'notice')?.text ?? ''
log('Hinweis:', JSON.stringify(notiz))
check(notiz.includes('Abgezweigt aus'), 'der Ast sagt, woher er kommt')
check(/nach Nachricht 1 von 3/.test(notiz), 'und dass der Agent auch die späteren Nachrichten kennt')
check(astVerlauf.every((i) => i.type !== 'user'), 'es wurde nichts gesendet – die Frage schreibt der Mensch')
await page.screenshot({ path: join(out, '2-ast.png') })

// Der Ursprung zeigt die Abzweigstelle an der richtigen Stelle
const marken = page.locator('.fork-markers')
check((await marken.count()) === 1, 'der Ursprung markiert die Abzweigstelle')
const markeNach = await page.evaluate(() => {
  const m = document.querySelector('.fork-markers')
  const u = m?.closest('.unit')
  return u?.getAttribute('data-item-id') ?? null
})
check(markeNach === 't1', 'die Marke steht hinter der ersten Antwort')

// 3. Im Diskursboard: Knopf an der überfahrenen Zeile
await page.locator('.chat-item', { hasText: 'Erkläre mir den Bundestag' }).first().hover()
await page.locator('.chat-item', { hasText: 'Erkläre mir den Bundestag' }).first().locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
const zeile = page.locator('.board-row', { hasText: 'Wer schreibt die Gesetze' }).first()
const boardKnopf = zeile.locator('.board-fork')
check((await boardKnopf.count()) === 1, 'jede Board-Zeile hat einen Knopf zum Abzweigen')
check((await boardKnopf.evaluate((e) => getComputedStyle(e).opacity)) === '0', 'der ist unsichtbar, bis die Maus auf der Zeile steht')
await zeile.hover()
await page.waitForTimeout(150)
check((await boardKnopf.evaluate((e) => getComputedStyle(e).opacity)) === '1', 'beim Überfahren der Zeile erscheint er')
await page.screenshot({ path: join(out, '3-board.png') })
await boardKnopf.click()
await page.waitForTimeout(600)
const zwei = chats().filter((c) => c.id !== 'src' && c.id !== ast.id)
log('zweiter Ast:', JSON.stringify(zwei.map((c) => c.forkFrom?.at)))
check(zwei.length === 1, 'der Klick im Board legt genau einen Ast an')
check(zwei[0]?.forkFrom?.at?.itemId === 'u3' && zwei[0]?.forkFrom?.at?.turn === 3, 'er hängt an der angeklickten Zeile')
const notiz2 = (await transcript(zwei[0].id)).find((i) => i.type === 'notice')?.text ?? ''
check(!/nach Nachricht/.test(notiz2), 'am Ende des Verlaufs steht kein Hinweis auf spätere Nachrichten')
check((await page.locator('.board-row').count()) >= 3, 'das Board bleibt offen')
await page.screenshot({ path: join(out, '4-zweiter-ast.png') })

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
