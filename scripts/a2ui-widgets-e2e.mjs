// E2E-Test: Tabelle, KPIs, Fortschritt, Badges, Alert mit echter Claude CLI (Modell sonnet).
// Aufruf: npm run build && node scripts/a2ui-widgets-e2e.mjs [ausgabe-verzeichnis]
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/a2ui-widgets'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, join(work, 'bilder')]) mkdirSync(d, { recursive: true })
copyFileSync(join(root, 'resources/icon.png'), join(work, 'bilder/logo.png'))
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'sonnet', defaultMode: 'acceptEdits' } } }))
const log = (...a) => console.log('[widgets]', ...a)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: 'Claude' }).click()
const cell = page.locator('.cell').first()

async function waitTurn(n) {
  await cell.locator('.msg-turn').nth(n).waitFor({ timeout: 300_000 })
}

await cell.locator('textarea').fill(
  'Zeig mir als Oberfläche ein Projekt-Dashboard „Website-Relaunch“: oben drei KPI-Kacheln (Budget verbraucht 48.200 € ' +
    'von 60.000 €, offene Aufgaben 7 (Vorwoche 9), Bugs 12 (+20 % ggü. Vorwoche – mehr ist schlecht)), darunter ein ' +
    'Fortschrittsbalken Gesamtfortschritt 64 %, dann eine Tabelle der Aufgaben (Titel, Verantwortlich, Status, Fällig, Aufwand in Std.) ' +
    'mit 5 Beispielaufgaben, Status als Text. Wenn ich auf eine Zeile klicke, zeig im selben Screen unter der Tabelle die ' +
    'Details dieser Aufgabe in einer Hinweisbox an, mit einem Status-Badge.'
)
await cell.locator('textarea').press('Enter')
await waitTurn(0)
const frame = cell.locator('.a2ui-frame').first()
log('Screens:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
log('Metrics:', await frame.locator('.c2-metric').count(), '| Tabellenzeilen:', await frame.locator('.c2-table tbody tr').count(),
  '| Progress:', await frame.locator('.c2-progress').count(), '| Alerts:', await frame.locator('.c2-alert').count(), '| Badges:', await frame.locator('.c2-badge').count())
log('KPIs:', (await frame.locator('.c2-metric').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | '))
await page.screenshot({ path: join(out, '1-dashboard.png') })

await frame.locator('.c2-table tbody tr').nth(1).click()
await cell.locator('.a2ui-action').first().waitFor({ timeout: 10_000 })
log('Aktion:', (await cell.locator('.a2ui-action pre').first().textContent()).slice(0, 200))
await waitTurn(1)
log('Nach Klick – Alerts:', await frame.locator('.c2-alert').count(), '| Badges:', await frame.locator('.c2-badge').count(),
  '| Updates:', await cell.locator('button.a2ui-update').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
log('Detail:', (await frame.locator('.c2-alert').last().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200))
await frame.locator('.c2-table').scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, '2-details.png') })
await app.close()
log('fertig')
