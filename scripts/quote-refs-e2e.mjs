// E2E: Text in einer Antwort markieren → Bezug nehmen → senden; danach „In neuem Chat fragen“ (Fork).
// Aufruf: npm run build && node scripts/quote-refs-e2e.mjs [claude|codex] [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const agent = process.argv[2] ?? 'claude'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[3] ?? join(root, `smoke-out/quote-refs-${agent}`))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'haiku', defaultMode: 'acceptEdits' } } }))
const log = (...a) => console.log(`[quote-${agent}]`, ...a)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: agent === 'codex' ? 'Codex' : 'Claude' }).click()
const cell = page.locator('.cell').first()
const turn = (c, n) => c.locator('.msg-turn').nth(n).waitFor({ timeout: 300_000 })

await cell.locator('textarea').fill(
  'Das Codewort ist Pfirsich – merk es dir, aber nenne es nicht. Nenne drei Obstsorten als nummerierte Liste, je ein kurzer Satz. Keine Werkzeuge.'
)
await cell.locator('textarea').press('Enter')
await turn(cell, 0)

/** Markiert den Text des n-ten Listenpunkts der letzten Antwort und lässt die Maus los. */
async function selectItem(n) {
  return page.evaluate((n) => {
    const answers = document.querySelectorAll('.cell .msg-assistant li')
    const li = answers[n]
    const range = document.createRange()
    range.selectNodeContents(li)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(range)
    li.closest('.transcript').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return s.toString()
  }, n)
}

const q1 = await selectItem(1)
log('markiert:', JSON.stringify(q1))
await page.locator('.quote-pill button').click()
await page.locator('.quote-box textarea').fill('Warum gerade diese Sorte?')
await page.locator('.quote-box .btn.primary').click()
log('Chips:', await cell.locator('.ref-chip').count())
await cell.locator('.composer textarea').fill('Antworte in einem Satz.')
await cell.locator('.composer .btn.primary').click()
await turn(cell, 1)
log('Zitat in Nutzernachricht:', await cell.locator('.msg-user .bubble-quote').count(), '| Chips nach Senden:', await cell.locator('.ref-chip').count())
log('Antwort 2:', (await cell.locator('.msg-assistant').last().innerText()).slice(0, 200).replace(/\n/g, ' '))
await page.screenshot({ path: join(out, '1-bezug.png') })

// Fork
await selectItem(0)
await page.locator('.quote-pill button').click()
await page.locator('.quote-box textarea').fill('Wie lautet das Codewort von vorhin? Nur das Wort.')
await page.screenshot({ path: join(out, '2-overlay.png') })
await page.locator('.quote-box .btn', { hasText: 'In neuem Chat fragen' }).click()
await page.locator('.cell').nth(1).waitFor()
const cell2 = page.locator('.cell').nth(1)
await turn(cell2, 0)
log('Zellen:', await page.locator('.cell').count(), '| Hinweis:', (await cell2.locator('.msg-notice, .notice').first().innerText().catch(() => '–')).slice(0, 90))
const ans = await cell2.locator('.msg-assistant').last().innerText()
log('Fork-Antwort:', ans.slice(0, 120).replace(/\n/g, ' '), '| kennt Codewort:', /pfirsich/i.test(ans))
log('Titel neuer Chat:', await page.locator('.sidebar .chat-item, .sidebar li').first().innerText().catch(() => '?'))
await page.screenshot({ path: join(out, '3-fork.png') })
await app.close()
