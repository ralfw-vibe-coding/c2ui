// End-to-End-Smoke-Test gegen die echte Claude CLI.
// Aufruf: npm run build && node scripts/smoke.mjs <ausgabe-verzeichnis>
// Nutzt ein eigenes userData-Verzeichnis und das Modell "haiku".
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const out = resolve(process.argv[2] ?? 'smoke-out')
const userData = join(out, 'userdata')
const work1 = join(out, 'projekt-a')
const work2 = join(out, 'projekt-b')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work1, work2]) mkdirSync(d, { recursive: true })
writeFileSync(join(work1, 'notiz.txt'), 'Die Geheimzahl ist 4711.\n')
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ model: 'haiku', defaultPermissionMode: 'acceptEdits' }))

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const log = (...a) => console.log('[smoke]', ...a)

async function launch() {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 860 }).catch(() => {})
  await page.waitForSelector('.app')
  return { app, page }
}

async function pickDir(app, dir) {
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dir)
}

async function sendAndWait(page, cell, text) {
  const turns = await cell.locator('.msg-turn').count()
  await cell.locator('textarea').fill(text)
  await cell.locator('textarea').press('Enter')
  await cell.locator('.msg-turn').nth(turns).waitFor({ timeout: 120_000 })
}

let { app, page } = await launch()
await page.screenshot({ path: join(out, '01-leer.png') })

// Chat 1 in der einzigen Zelle
await pickDir(app, work1)
await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
let cells = page.locator('.cell')
await sendAndWait(page, cells.nth(0), 'Lies notiz.txt und nenne mir in einem kurzen Satz die Geheimzahl.')
const answer1 = await cells.nth(0).locator('.msg-assistant').last().innerText()
log('Antwort 1:', answer1.replace(/\s+/g, ' ').slice(0, 200))
log('Tool-Aufrufe in Chat 1:', await cells.nth(0).locator('.tool').count())

// Rechts teilen, Chat 2
await cells.nth(0).locator('[title="Rechts teilen"]').click()
await pickDir(app, work2)
await page.locator('.cell').nth(1).locator('.new-chat-big', { hasText: 'Codex' }).click()
await sendAndWait(page, page.locator('.cell').nth(1), 'Antworte nur mit dem Wort: Banane')
log('Antwort 2 (Codex):', (await page.locator('.cell').nth(1).locator('.msg-assistant').last().innerText()).trim())
await sendAndWait(page, page.locator('.cell').nth(1), 'Welches Wort hast du eben geantwortet? Nur das Wort, in Großbuchstaben.')
log('Antwort 2b (Codex, resume):', (await page.locator('.cell').nth(1).locator('.msg-assistant').last().innerText()).trim())
log('Codex-Modus:', await page.locator('.cell').nth(1).locator('.mode-select').inputValue())

// Unten teilen in Zelle 2 -> leere dritte Zelle
await page.locator('.cell').nth(1).locator('[title="Unten teilen"]').click()
await page.screenshot({ path: join(out, '02-drei-zellen.png') })

// Drag&Drop: Chat 1 (Header) in die untere Hälfte der leeren Zelle -> verschiebt
const src = page.locator('.cell').nth(0).locator('.cell-title')
const empty = page.locator('.cell').nth(2)
const box = await empty.boundingBox()
await src.dragTo(empty, { targetPosition: { x: box.width / 2, y: box.height * 0.5 } })
await page.waitForTimeout(300)
log('Zellen nach Drop (Mitte):', await page.locator('.cell').count(), '| leere Zellen:', await page.locator('.empty-cell').count())
await page.screenshot({ path: join(out, '03-nach-drop.png') })

// Resize am ersten Trenner
const div = page.locator('.divider-row').first()
const db = await div.boundingBox()
await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2)
await page.mouse.down()
await page.mouse.move(db.x - 200, db.y + db.height / 2, { steps: 8 })
await page.mouse.up()
const widths = await page.locator('.cell').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
log('Zellbreiten nach Resize:', widths.join(', '))
await page.screenshot({ path: join(out, '04-resize.png') })

const layoutBefore = await page.locator('.cell').evaluateAll((els) =>
  els.map((e) => e.querySelector('.cell-title-text')?.textContent ?? '(leer)')
)
await app.close()

// Neustart: Layout und Transkripte müssen wieder da sein, Session wird fortgesetzt
;({ app, page } = await launch())
await page.waitForTimeout(500)
const layoutAfter = await page.locator('.cell').evaluateAll((els) =>
  els.map((e) => e.querySelector('.cell-title-text')?.textContent ?? '(leer)')
)
log('Layout vorher:', JSON.stringify(layoutBefore))
log('Layout nachher:', JSON.stringify(layoutAfter))
const chat1 = page.locator('.cell', { has: page.locator('.cell-title-text', { hasText: 'notiz' }) })
log('Nachrichten in Chat 1 nach Neustart:', await chat1.locator('.msg').count())
await sendAndWait(page, chat1, 'Welche Geheimzahl hast du mir vorhin genannt? Nur die Zahl.')
log('Antwort nach Resume:', (await chat1.locator('.msg-assistant').last().innerText()).trim())
await page.screenshot({ path: join(out, '05-nach-neustart.png') })
log('Sidebar-Einträge:', await page.locator('.chat-item').count())
await app.close()
log('fertig')
