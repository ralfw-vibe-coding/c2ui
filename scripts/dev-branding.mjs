// Gibt dem lokalen Electron (node_modules) im Entwicklungsmodus den Namen und das Icon
// von C2UI, damit Menüleiste und Dock nicht "Electron" zeigen. Nur macOS.
// Läuft automatisch nach `npm install` (postinstall).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, utimesSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'C2UI'

if (process.platform !== 'darwin') process.exit(0)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(appDir, 'Contents/Info.plist')
if (!existsSync(plist)) {
  console.log('[dev-branding] Electron.app nicht gefunden, übersprungen.')
  process.exit(0)
}

for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  execFileSync('plutil', ['-replace', key, '-string', NAME, plist])
}

const icns = join(root, 'resources/icon.icns')
if (existsSync(icns)) copyFileSync(icns, join(appDir, 'Contents/Resources/electron.icns'))

// macOS cacht Bundle-Infos; ein geänderter Zeitstempel sorgt für Neueinlesen.
const now = new Date()
utimesSync(appDir, now, now)
console.log(`[dev-branding] Electron.app heißt jetzt „${NAME}“.`)
