// E2E: Zusammenführen eines Nebenchats in seinen Ursprung (echte Claude-CLI, Haiku).
// 1) Nebenchat „Zurückführen“ → Dialog → Aufarbeitung in B → Vorschau → Übernahme in A; A kennt danach das Ergebnis.
// 2) Board zeigt die Zusammenführung (Kante, Knoten); Knoten auf eine andere Spur ziehen öffnet den Dialog,
//    „Verlauf direkt übernehmen“ zeigt den Verlauf in der Vorschau (ohne Modellaufruf).
// Aufruf: npm run build && node scripts/merge-e2e.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/merge'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'bypassPermissions' } } }))
const log = (...a) => console.log('[merge]', ...a)
let failed = false
const check = (ok, what) => {
  log(ok ? 'OK  ' : 'FEHLER', what)
  if (!ok) failed = true
}

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
const idle = () => page.waitForFunction(() => !document.querySelector('.cell .working'), null, { timeout: 180_000 })
const say = async (cell, text) => {
  const ta = cell.locator('.composer textarea')
  await ta.fill(text)
  await ta.press('Enter')
  await cell.locator('.working').waitFor().catch(() => {})
  await idle()
}

// Ursprung A
await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
const cellA = page.locator('.cell').first()
await say(cellA, 'Wir planen gemeinsam eine Reise. Ziel und Budget klären wir in einem Nebengespräch. Antworte nur mit „OK“.')
const chatA = await cellA.locator('.chat-panel').getAttribute('data-chat-id')

// Nebenchat B (abgezweigt), in neuer Zelle
const chatB = await page.evaluate(async (a) => (await window.api.forkChat(a, 'Reiseziel')).id, chatA)
await page.locator('.chat-item', { hasText: 'Reiseziel' }).click({ modifiers: ['Meta'] })
const cellB = page.locator('.cell').nth(1)
await cellB.locator('.chat-panel').waitFor()
check((await cellB.locator('.chat-panel').getAttribute('data-chat-id')) === chatB, 'Nebenchat in neuer Zelle')
await say(cellB, 'Entschieden: Das Ziel ist Lissabon, Budget 800 Euro, Reisezeit Mai. Antworte nur mit „Notiert“.')

// 1) Zurückführen mit Vorschau
await cellB.locator('.merge-back').click()
await page.locator('.merge-dialog').waitFor()
const route = (await page.locator('.merge-route').innerText()).replace(/\s+/g, ' ')
log('Dialog:', route)
check(/Reiseziel → /.test(route), 'Dialog zeigt B → A')
check(/Fasse für den Chat/.test(await page.locator('.merge-dialog textarea').first().getAttribute('placeholder')), 'Standard-Prompt als Platzhalter')
await page.screenshot({ path: join(out, '1-dialog.png') })
await page.locator('.merge-start').click()
check((await page.locator('.merge-dialog').count()) === 0, 'Dialog schließt, B arbeitet auf')
await cellB.locator('.merge-label', { hasText: 'Aufarbeitung' }).waitFor({ timeout: 30_000 })
await page.locator('.merge-text').waitFor({ timeout: 180_000 })
const prepared = await page.locator('.merge-text').inputValue()
log('Aufarbeitung:', prepared.slice(0, 200).replace(/\n/g, ' '))
check(/Lissabon/i.test(prepared), 'Aufarbeitung nennt das Ergebnis')
await page.screenshot({ path: join(out, '2-vorschau.png') })
await page.locator('.merge-text').fill(prepared + '\n\nZusatz aus der Vorschau: Unterkunft in der Alfama.')
await page.locator('.merge-adopt').click()
await cellA.locator('.merge-label', { hasText: 'Übernommen aus' }).waitFor({ timeout: 30_000 })
check(/Alfama/.test(await cellA.locator('.msg-user').last().innerText()), 'bearbeitete Vorschau kommt in A an')
await idle()
await say(cellA, 'Wohin geht die Reise und in welchem Viertel wohnen wir? Antworte in einem kurzen Satz.')
const answerA = await cellA.locator('.msg-assistant').last().innerText()
log('A antwortet:', answerA.replace(/\n/g, ' ').slice(0, 160))
check(/Lissabon/i.test(answerA) && /Alfama/i.test(answerA), 'A kennt das zusammengeführte Ergebnis')
await page.screenshot({ path: join(out, '3-uebernommen.png') })

// 2) Board: Kante und Knoten
const itemA = page.locator('.chat-item').filter({ has: page.locator('.chat-title', { hasText: /Reise/ }) }).first()
await itemA.hover()
await itemA.locator('.icon-btn[title*="Diskursboard"]').click()
await page.locator('.board-row').first().waitFor()
check((await page.locator('.board-merge').count()) === 1, 'Board: Kante der Zusammenführung')
check((await page.locator('.board-row.merge').count()) === 1 && (await page.locator('.board-row.prepare').count()) === 1, 'Board: Knoten für Aufarbeitung und Übernahme')
await page.screenshot({ path: join(out, '4-board.png') })

// Knoten aus B auf die Spur von A ziehen → Dialog; direkt übernehmen mit Vorschau
const srcRow = page.locator('.board-row', { hasText: 'Entschieden' })
const dstRow = page.locator('.board-row', { hasText: 'Wohin geht' })
await srcRow.dragTo(dstRow)
await page.locator('.merge-dialog').waitFor({ timeout: 5000 })
const route2 = (await page.locator('.merge-route').innerText()).replace(/\s+/g, ' ')
log('Dialog nach Ziehen:', route2, '|', await page.locator('.merge-dialog .muted.small').first().innerText())
check(/Reiseziel → /.test(route2), 'Ziehen auf die Spur öffnet den Dialog B → A')
await page.locator('.merge-dialog .check-row', { hasText: 'direkt' }).locator('input').check()
check(await page.locator('.merge-dialog textarea').first().isDisabled(), 'direkt: Aufarbeitungs-Prompt gesperrt')
await page.locator('.merge-start').click()
await page.locator('.merge-text').waitFor({ timeout: 5000 })
const excerpt = await page.locator('.merge-text').inputValue()
log('Verlauf:', excerpt.slice(0, 160).replace(/\n/g, ' '))
check(/\*\*Frage:\*\* Entschieden/.test(excerpt) && !/Fasse für den Chat/.test(excerpt), 'direkt: Verlauf bis zum gezogenen Knoten (ohne spätere Aufarbeitung)')
await page.locator('.merge-dialog .btn', { hasText: 'Verwerfen' }).click()
check((await page.locator('.merge-dialog').count()) === 0, 'Verwerfen schließt ohne Senden')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
