// E2E-Test: A2UI mit echter Codex CLI (Standardmodell aus ~/.codex/config.toml).
// Aufruf: npm run build && node scripts/a2ui-codex-e2e.mjs
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'smoke-out/a2ui-codex')
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, work]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { codex: { defaultMode: 'workspace-write' } } }))
const log = (...a) => console.log('[codex]', ...a)

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
await app.evaluate(({ dialog }, d) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
}, work)
await page.locator('.new-chat-big', { hasText: 'Codex' }).click()
const cell = page.locator('.cell').first()
const waitTurn = (n) => cell.locator('.msg-turn').nth(n).waitFor({ timeout: 400_000 })

await cell.locator('textarea').fill(
  'Zeig mir als Oberfläche ein Formular „Urlaubsantrag“: Name, Von (Datum), Bis (Datum), Vertretung, Button „Beantragen“. ' +
    'Nach dem Klick zeig im selben Screen eine Bestätigung (Alert, Erfolg) mit den Angaben und einer Tabelle der beantragten Tage.'
)
await cell.locator('textarea').press('Enter')
await waitTurn(0)
const frame = cell.locator('.a2ui-frame').first()
log('Screens:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count(),
  '| Tools:', (await cell.locator('.tool .tool-name').allInnerTexts()).join(', '))
log('Schatten-Home-Skill vorhanden:', existsSync(join(userData, 'codex-home/.agents/skills/claude2ui-a2ui/SKILL.md')),
  '| Einträge:', readdirSync(join(userData, 'codex-home')).length)
await page.screenshot({ path: join(out, '1-formular.png') })

if (await cell.locator('.a2ui-frame').count()) {
  await frame.locator('input:not([type=range]):not([type=checkbox]):not([type=date]):not([type=datetime-local])').first().fill('Ralf')
  await frame.getByText('Beantragen').last().click()
  await cell.locator('.a2ui-action').first().waitFor({ timeout: 10_000 })
  await waitTurn(1)
  log('Nach Aktion – Updates:', await cell.locator('button.a2ui-update').count(), '| Alerts:', await frame.locator('.c2-alert').count(),
    '| Tabellen:', await frame.locator('.c2-table').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
  log('Screen:', (await frame.innerText()).replace(/\s+/g, ' ').slice(0, 260))
  await frame.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '2-bestaetigung.png') })
}
log('Fehler im Chat:', (await cell.locator('.msg-error').allInnerTexts()).join(' | ').slice(0, 300))
await app.close()
log('fertig')
