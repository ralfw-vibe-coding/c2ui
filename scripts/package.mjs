// Baut C2UI.app, schreibt Build-Angaben hinein, signiert mit fester Identität und packt ein ZIP nach dist/.
// Das ZIP kann in einen Update-Ordner (z. B. geteilter Dropbox-Ordner) – die installierten Apps bieten es dann an.
//
//   npm run package              → dist/C2UI-<version>-b<build>-<arch>.zip (+ dist/mac-arm64/C2UI.app)
//   npm run package -- --install → zusätzlich nach /Applications (nur wenn C2UI nicht läuft)
//
// Signatur-Identität: package.json "c2ui.signIdentity" oder Umgebungsvariable C2UI_SIGN_IDENTITY.
// Ein selbst erstelltes Code-Signing-Zertifikat genügt; jeder Build muss mit demselben signiert sein.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const NAME = pkg.build.productName
const ARCH = 'arm64' // wie mac.target in package.json
const identity = process.env.C2UI_SIGN_IDENTITY || pkg.c2ui?.signIdentity
const install = process.argv.includes('--install')
const log = (...a) => console.log('[package]', ...a)
const sh = (cmd, args, opts = {}) => (execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts }) ?? '').trim()
const git = (...args) => sh('git', args)

if (!identity) throw new Error('Keine Signatur-Identität: package.json "c2ui.signIdentity" oder C2UI_SIGN_IDENTITY setzen.')

const build = Number(git('rev-list', '--count', 'HEAD'))
const commit = git('rev-parse', '--short', 'HEAD')
if (git('status', '--porcelain')) log(`Achtung: nicht committete Änderungen – sie stecken trotzdem in Build ${build}.`)

log('electron-vite build …')
sh('npx', ['electron-vite', 'build'], { stdio: 'inherit' })
log('electron-builder …')
sh('npx', ['electron-builder', '--mac', '--dir'], { stdio: 'inherit' })

const app = join(root, 'dist', `mac-${ARCH}`, `${NAME}.app`)
const info = { productName: NAME, version: pkg.version, build, commit, arch: ARCH }
writeFileSync(join(app, 'Contents', 'Resources', 'build.json'), JSON.stringify(info, null, 2) + '\n')
log('Build-Angaben:', JSON.stringify(info))

log(`signieren mit „${identity}“ …`)
sh('codesign', ['--force', '--deep', '--sign', identity, app], { stdio: 'inherit' })
sh('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
log('Anforderung:', sh('codesign', ['-d', '-r-', app], { stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^designated => /, ''))

const zipName = `${NAME}-${pkg.version}-b${build}-${ARCH}.zip`
for (const f of readdirSync(join(root, 'dist'))) if (f.startsWith(`${NAME}-`) && f.endsWith('.zip')) rmSync(join(root, 'dist', f))
sh('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, join(root, 'dist', zipName)])
log(`ZIP: dist/${zipName}`)

if (install) {
  let running = false
  try {
    running = !!sh('pgrep', ['-f', `/Applications/${NAME}.app/Contents/MacOS/`])
  } catch {
    running = false
  }
  if (running) log(`${NAME} läuft – nicht installiert. Erst beenden, dann erneut mit --install (oder über den Update-Ordner).`)
  else {
    const target = `/Applications/${NAME}.app`
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    sh('ditto', [app, target])
    log(`installiert: ${target}`)
  }
}
