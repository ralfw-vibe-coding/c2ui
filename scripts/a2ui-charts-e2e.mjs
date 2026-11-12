// E2E-Test: Charts und lokales Bild mit echter Claude CLI (Modell sonnet).
// Aufruf: npm run build && node scripts/a2ui-charts-e2e.mjs [ausgabe-verzeichnis]
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/a2ui-charts'))
const userData = join(out, 'userdata')
const work = join(out, 'projekt')
rmSync(out, { recursive: true, force: true })
for (const d of [userData, join(work, 'bilder')]) mkdirSync(d, { recursive: true })
copyFileSync(join(root, 'resources/icon.png'), join(work, 'bilder/logo.png'))
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ agents: { claude: { model: 'sonnet', defaultMode: 'acceptEdits' } } }))
const log = (...a) => console.log('[charts]', ...a)

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
  'Bau mir als Oberfläche ein kleines Vertriebs-Dashboard: oben links unser Logo aus bilder/logo.png (klein), ' +
    'darunter ein Liniendiagramm Umsatz Jan–Jun (120, 135, 160, 150, 190, 210 €), daneben ein Balkendiagramm ' +
    'Abschlüsse je Team (Nord 12, Süd 8, West 15) und ein Ringdiagramm Umsatz nach Produkt (A 50 %, B 30 %, C 20 %). ' +
    'Dazu ein Button „Zweites Halbjahr“, der im selben Screen die Liniendaten auf Jul–Dez (220, 205, 240, 260, 250, 300 €) umstellt.'
)
await cell.locator('textarea').press('Enter')
await waitTurn(0)
const frame = cell.locator('.a2ui-frame').first()
log('Screens:', await cell.locator('.a2ui-frame').count(), '| abgelehnt:', await cell.locator('.a2ui-rejected').count())
log('Charts:', await frame.locator('.c2-chart').count(), '| Linien:', await frame.locator('.recharts-line, .recharts-area').count(),
  '| Balken:', await frame.locator('.recharts-bar-rectangle').count(), '| Segmente:', await frame.locator('.recharts-pie-sector').count())
log('Bilder:', JSON.stringify(await frame.locator('img.c2-image').evaluateAll((es) => es.map((e) => [e.getAttribute('src'), e.naturalWidth]))),
  '| fehlend:', await frame.locator('.c2-image-missing').count())
const ticks = async () =>
  (await frame.locator('.c2-chart').first().locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').evaluateAll((es) => es.map((e) => e.textContent))).join(',')
log('x-Achse vorher:', await ticks())
await page.screenshot({ path: join(out, '1-dashboard.png') })

await frame.getByText('Zweites Halbjahr').first().click()
await waitTurn(1)
log('x-Achse nachher:', await ticks(), '| Updates:', await cell.locator('button.a2ui-update').count(), '| Screens:', await cell.locator('.a2ui-frame').count())
await frame.scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, '2-halbjahr.png') })
await app.close()
log('fertig')
