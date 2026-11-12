// Prüft die Link-Komponente in der Testansicht (#a2ui-test): Klick öffnet über shell.openExternal,
// danach violett; gesperrte Schemata werden nicht geöffnet.
// Aufruf: npm run build && node scripts/link-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/link'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
await app.evaluate(({ shell }) => {
  globalThis.__opened = []
  shell.openExternal = async (u) => void globalThis.__opened.push(u)
})
const page = await app.firstWindow()
await page.waitForSelector('.app')
await page.evaluate(() => { location.hash = '#a2ui-test'; location.reload() })
await page.waitForSelector('.c2-link')
const links = page.locator('.c2-link')
const color = (i) => links.nth(i).evaluate((el) => getComputedStyle(el).color)
console.log('Links:', await links.allInnerTexts())
const before = await color(0)
await links.nth(0).click()
await links.nth(1).click()
await links.nth(3).click()
await page.waitForTimeout(300)
console.log('geöffnet:', await app.evaluate(() => globalThis.__opened))
console.log('Farbe vorher/nachher:', before, await color(0), '| unbesucht:', await color(2))
console.log('Klassen:', await links.evaluateAll((els) => els.map((e) => e.className)))
console.log('URL unverändert:', page.url().endsWith('#a2ui-test'))
await page.locator('#links, .c2-link').first().scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, 'links.png') })
await app.close()
