// Prüfung ohne Modellaufruf: Der Zellenkopf gibt bei schmalen Zellen von innen nach außen nach.
// Die Knöpfe rechts (teilen, schließen, Zelle entfernen) müssen bis zur schmalsten Zelle sichtbar
// und anklickbar bleiben – sonst lässt sich ein Chat dort nicht mehr schließen.
// Aufruf: npm run build && node scripts/cell-head-check.mjs [ausgabe-verzeichnis]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/cell-head'))
const userData = join(out, 'userdata')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(userData, 'transcripts'), { recursive: true })
writeFileSync(join(userData, 'chats.json'), JSON.stringify([
  { id: 'c', title: 'Ein ziemlich langer Chattitel für den Test', agent: 'claude', cwd: root,
    permissionMode: 'default', sessionId: 'c', sessionStarted: true, createdAt: 1, updatedAt: 2 }
]))
writeFileSync(join(userData, 'transcripts', 'c.json'), JSON.stringify([]))

const log = (...x) => console.log('[zellenkopf]', ...x)
let failed = false
const check = (ok, what) => { log(ok ? 'OK  ' : 'FEHLER', what); if (!ok) failed = true }

const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, CLAUDE2UI_USER_DATA: userData } })
const page = await app.firstWindow()
await page.waitForSelector('.chat-item')
await page.locator('.chat-item').click()
await page.locator('.chat-panel').waitFor()

/** Passen die Knöpfe der ersten Zelle in ihren Kopf? */
const messen = () =>
  page.evaluate(() => {
    const h = document.querySelector('.cell-header')
    const k = h.getBoundingClientRect()
    const a = h.querySelector('.cell-actions').getBoundingClientRect()
    const sicht = (sel) => {
      const e = h.querySelector(sel)
      if (!e) return null
      const r = e.getBoundingClientRect()
      return Math.round(r.right) <= Math.round(k.right) + 1 && r.width > 0
    }
    return {
      kopf: Math.round(k.width),
      ueberstand: Math.round(a.right - k.right),
      schliessen: sicht('.cell-actions button[title^="Chat schließen"]'),
      entfernen: sicht('.cell-actions button[title^="Zelle entfernen"]'),
      teilen: sicht('.cell-actions button[title="Rechts teilen"]'),
      titel: h.querySelector('.cell-title-text')?.textContent?.slice(0, 12) ?? '',
      modus: !!h.querySelector('.mode-select')?.getBoundingClientRect().width
    }
  })

for (let geteilt = 0; geteilt <= 3; geteilt++) {
  if (geteilt) {
    await page.locator('.cell-header button[title="Rechts teilen"]').first().click()
    await page.waitForTimeout(350)
  }
  const m = await messen()
  log(`${geteilt + 1} Zelle(n):`, JSON.stringify(m))
  check(m.ueberstand <= 0, `bei ${m.kopf} px Kopfbreite stehen die Knöpfe nicht über den Rand hinaus`)
  check(m.schliessen === true && m.entfernen === true, 'Schließen und Entfernen sind sichtbar')
  check(m.teilen === true, 'Teilen ebenfalls')
  if (geteilt === 0) check(m.modus === true, 'in der breiten Zelle steht auch der Modus da')
  await page.screenshot({ path: join(out, `${geteilt + 1}-zellen.png`) })
}

// Und der Klick kommt auch an: Chat in der schmalsten Zelle schließen.
const zellen = await page.locator('.cell').count()
await page.locator('.cell-header button[title^="Chat schließen"]').first().click()
await page.waitForTimeout(500)
check((await page.locator('.cell').count()) === zellen, 'die Zelle bleibt')
check((await page.locator('.chat-panel').count()) === 0, 'der Chat ist geschlossen – der Knopf ist erreichbar')

await app.close()
log(failed ? 'FEHLGESCHLAGEN' : 'alles OK')
process.exit(failed ? 1 : 0)
