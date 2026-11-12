// E2E der Selbst-Aktualisierung mit dem echten, signierten Build (vorher: npm run package).
// Installiert dist/mac-arm64/C2UI.app in einen Testordner, legt einen neueren Build (gleich signiert) und einen
// fremd signierten (ad-hoc) in Update-Ordner, startet die App, wählt die Ordner und lässt sie sich tauschen.
// Aufruf: node scripts/update-e2e.mjs [ausgabe-verzeichnis]
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const identity = process.env.C2UI_SIGN_IDENTITY || pkg.c2ui.signIdentity
const out = resolve(process.argv[2] ?? join(root, 'smoke-out/update'))
const src = join(root, 'dist/mac-arm64/C2UI.app')
const apps = join(out, 'Apps')
const app = join(apps, 'C2UI.app')
const goodDir = join(out, 'updates-gut')
const badDir = join(out, 'updates-fremd')
const bin = join(out, 'bin')
const openLog = join(out, 'open.log')
const log = (...a) => console.log('[update]', ...a)
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' })

rmSync(out, { recursive: true, force: true })
for (const d of [apps, goodDir, badDir, bin, join(out, 'userdata')]) mkdirSync(d, { recursive: true })
sh('ditto', [src, app])
const current = JSON.parse(readFileSync(join(app, 'Contents/Resources/build.json'), 'utf8'))
log('installiert (Test):', current.build)

/** Kopie des Builds mit anderer Build-Nummer, signiert mit `sign`, als ZIP in `dir`. */
function variant(dir, build, sign) {
  const tmp = join(out, `v${build}`)
  sh('ditto', [src, join(tmp, 'C2UI.app')])
  writeFileSync(join(tmp, 'C2UI.app/Contents/Resources/build.json'), JSON.stringify({ ...current, build }))
  sh('codesign', ['--force', '--deep', '--sign', sign, join(tmp, 'C2UI.app')])
  sh('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', join(tmp, 'C2UI.app'), join(dir, `C2UI-b${build}.zip`)])
  rmSync(tmp, { recursive: true, force: true })
}
variant(goodDir, current.build + 1, identity)
variant(goodDir, current.build - 1, identity) // älter: darf nicht angeboten werden
writeFileSync(join(goodDir, 'kaputt.zip'), 'kein zip')
variant(badDir, current.build + 5, '-')

// Eigenes "open" vorne im PATH: protokolliert den Neustart, statt die App wirklich zu öffnen.
writeFileSync(join(bin, 'open'), `#!/bin/sh\necho "$@" >> "${openLog}"\n`)
chmodSync(join(bin, 'open'), 0o755)

const electronApp = await electron.launch({
  executablePath: join(app, 'Contents/MacOS/C2UI'),
  env: { ...process.env, CLAUDE2UI_USER_DATA: join(out, 'userdata'), PATH: `${bin}:${process.env.PATH}` }
})
const page = await electronApp.firstWindow()
await page.waitForSelector('.app')
const state = () => page.evaluate(() => window.api.updateState())
log('Start:', JSON.stringify(await state()))

// Fremd signiert → muss abgelehnt werden
log('fremd:', JSON.stringify(await page.evaluate((d) => window.api.updateFolder(d), badDir)))
const r1 = await page.evaluate(() => window.api.updateInstall())
log('Installieren (fremd):', JSON.stringify(r1))
log('Staging aufgeräumt:', !existsSync(join(apps, '.C2UI Update')))

// Gleich signiert → wird angeboten (Einstellungen zeigen es) und getauscht
log('gut:', JSON.stringify(await page.evaluate((d) => window.api.updateFolder(d), goodDir)))
await page.locator('button[title="Einstellungen"]').click()
await page.locator('.update-status').waitFor()
log('Einstellungen:', await page.locator('fieldset', { hasText: 'Aktualisierung' }).innerText().then((t) => t.replace(/\n/g, ' | ')))
log('Punkt am Knopf:', await page.locator('.update-dot').count())
await page.screenshot({ path: join(out, 'einstellungen.png') })
const closed = new Promise((r) => electronApp.process().once('exit', r))
await page.locator('.update-status button').click()
const timeout = new Promise((r) => setTimeout(() => r('timeout'), 60_000))
if ((await Promise.race([closed, timeout])) === 'timeout') {
  log('App hat sich nicht beendet. Zustand:', JSON.stringify(await state().catch((e) => String(e))))
  await electronApp.close()
  process.exit(1)
}
log('App beendet, warte auf Tausch …')
for (let i = 0; i < 50 && !existsSync(openLog); i++) await new Promise((r) => setTimeout(r, 200))
const after = JSON.parse(readFileSync(join(app, 'Contents/Resources/build.json'), 'utf8'))
log('nach dem Tausch:', after.build, '| erwartet:', current.build + 1)
log('Neustart angefordert:', existsSync(openLog) ? readFileSync(openLog, 'utf8').trim() : '–')
log('Staging aufgeräumt:', !existsSync(join(apps, '.C2UI Update')))
log('Signatur gültig:', (() => { try { sh('codesign', ['--verify', '--deep', '--strict', app]); return true } catch { return false } })())
