import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseUpdateState } from '@shared/update'
import { bundleOf, newestOffer, offerOf, requirementOf, SWAP_SCRIPT, Updater, type UpdaterTools } from './updater'

describe('Updater: reine Funktionen', () => {
  it('bundleOf', () => {
    expect(bundleOf('/Applications/C2UI.app/Contents/MacOS/C2UI')).toBe('/Applications/C2UI.app')
    expect(bundleOf('/Users/x/Apps/Mein Tool.app/Contents/MacOS/Mein Tool')).toBe('/Users/x/Apps/Mein Tool.app')
    expect(bundleOf('/usr/local/bin/node')).toBeUndefined()
  })

  it('offerOf: Build als Zahl oder Text, Chip muss passen, fehlender Chip passt', () => {
    expect(offerOf('a.zip', '{"version":"0.1.0","build":"141","commit":"abc","arch":"arm64"}', 'arm64')).toEqual({
      version: '0.1.0', build: 141, commit: 'abc', file: 'a.zip'
    })
    expect(offerOf('a.zip', '{"version":"0.1.0","build":141,"arch":"x64"}', 'arm64')).toBeUndefined()
    expect(offerOf('a.zip', '{"version":"0.1.0","build":141}', 'arm64')?.build).toBe(141)
    expect(offerOf('a.zip', 'kein json', 'arm64')).toBeUndefined()
    expect(offerOf('a.zip', '{"build":"x"}', 'arm64')).toBeUndefined()
  })

  it('newestOffer: höchster Build über dem laufenden', () => {
    const o = (build: number) => ({ version: '1', build, file: `${build}.zip` })
    expect(newestOffer([o(140), undefined, o(143), o(142)], 141)?.build).toBe(143)
    expect(newestOffer([o(140), o(141)], 141)).toBeUndefined()
  })

  it('requirementOf', () => {
    expect(requirementOf('designated => identifier "de.ralfw.c2ui" and certificate root = H"abc"\n')).toBe(
      'identifier "de.ralfw.c2ui" and certificate root = H"abc"'
    )
    expect(requirementOf('Executable=/x\n')).toBeUndefined()
  })

  it('parseUpdateState: Unpassendes gilt als unavailable', () => {
    expect(parseUpdateState({ state: 'off' })).toEqual({ state: 'off' })
    expect(parseUpdateState({ state: 'available', folder: '/f', checked: 't', offer: { version: '1', build: 2, file: 'x.zip' } }).state).toBe('available')
    expect(parseUpdateState({ state: 'available', folder: '/f', checked: 't', offer: { build: 'zwei' } })).toEqual({ state: 'unavailable' })
    expect(parseUpdateState(null)).toEqual({ state: 'unavailable' })
    expect(parseUpdateState({ state: 'hack' })).toEqual({ state: 'unavailable' })
  })
})

// ---------- Ablauf mit Attrappen ----------

const REQ = 'identifier "de.ralfw.c2ui" and certificate root = H"abc"'
const buildJson = (build: number, arch = 'arm64') => JSON.stringify({ version: '0.1.0', build, commit: 'c' + build, arch })

function fakeTools(opts: {
  zips?: Record<string, string | null> // Dateiname → build.json (null = kein App-ZIP)
  others?: string[]
  unpacked?: string // build.json im Entpackten
  verifyFails?: string
  requirementFails?: string
  dittoFails?: string
  listFails?: string
}) {
  const files: Record<string, string> = {}
  const log: string[] = []
  const tools: UpdaterTools & { detached?: string[]; quitted: boolean; files: typeof files; log: string[] } = {
    quitted: false,
    files,
    log,
    async list() {
      if (opts.listFails) throw new Error(opts.listFails)
      return [...Object.keys(opts.zips ?? {}), ...(opts.others ?? [])]
    },
    async run(cmd, args) {
      log.push([cmd, ...args].join(' '))
      if (cmd === 'unzip') {
        const name = args[1].split('/').pop()!
        const j = opts.zips?.[name]
        if (j == null) throw new Error('caution: filename not matched')
        return j
      }
      if (cmd === 'ditto' && opts.dittoFails) throw new Error(opts.dittoFails)
      if (cmd === 'codesign' && args[0] === '--verify' && args[1] === '--deep' && opts.verifyFails) throw new Error(opts.verifyFails)
      if (cmd === 'codesign' && args[0] === '-d') return `designated => ${REQ}\n`
      if (cmd === 'codesign' && args[1] === '-R' && opts.requirementFails) throw new Error(opts.requirementFails)
      return ''
    },
    async read(p) {
      if (p.endsWith('build.json') && opts.unpacked) return opts.unpacked
      if (p in files) return files[p]
      throw new Error('ENOENT')
    },
    async write(p, t) {
      files[p] = t
    },
    async remove(p) {
      log.push('remove ' + p)
    },
    detach(cmd, args) {
      tools.detached = [cmd, ...args]
    },
    quit() {
      tools.quitted = true
    },
    now: () => new Date('2026-11-13T10:00:00Z')
  }
  return tools
}

function updater(tools: UpdaterTools, current: number | null = 141) {
  const states: string[] = []
  const u = new Updater({
    tools,
    current: current === null ? null : { version: '0.1.0', build: current, arch: 'arm64' },
    exe: '/Applications/C2UI.app/Contents/MacOS/C2UI',
    pid: 4711,
    appName: 'C2UI',
    configFile: '/ud/update.json',
    onChange: (s) => states.push(s.state)
  })
  return { u, states }
}

describe('Updater: Ablauf', () => {
  it('App aus dem Repo: unavailable, tut nichts', async () => {
    const t = fakeTools({})
    const { u } = updater(t, null)
    await u.init()
    expect(u.state).toEqual({ state: 'unavailable' })
    expect((await u.setFolder('/x')).state).toBe('unavailable')
  })

  it('ohne Ordner: off; Ordner wird lokal gespeichert', async () => {
    const t = fakeTools({ zips: {} })
    const { u } = updater(t)
    await u.init()
    expect(u.state.state).toBe('off')
    await u.setFolder('/Dropbox/C2UI')
    expect(JSON.parse(t.files['/ud/update.json'])).toEqual({ folder: '/Dropbox/C2UI' })
    expect(u.state).toEqual({ state: 'current', folder: '/Dropbox/C2UI', checked: '2026-11-13T10:00:00.000Z' })
    await u.setFolder(undefined)
    expect(u.state.state).toBe('off')
  })

  it('bietet den höchsten passenden Build an, übergeht fremde ZIPs und anderen Chip', async () => {
    const t = fakeTools({
      zips: { 'alt.zip': buildJson(140), 'neu.zip': buildJson(143), 'neuer-intel.zip': buildJson(150, 'x64'), 'fremd.zip': null, 'mitte.zip': buildJson(142) },
      others: ['notiz.txt']
    })
    const { u } = updater(t)
    await u.setFolder('/f')
    expect(u.state).toMatchObject({ state: 'available', offer: { build: 143, file: 'neu.zip' } })
    expect(t.log.filter((l) => l.startsWith('unzip')).every((l) => l.includes('C2UI.app/Contents/Resources/build.json'))).toBe(true)
  })

  it('Ordner nicht lesbar', async () => {
    const t = fakeTools({ listFails: 'EACCES: permission denied' })
    const { u } = updater(t)
    await u.setFolder('/f')
    expect(u.state).toMatchObject({ state: 'failed', message: 'Ordner nicht lesbar: EACCES: permission denied' })
  })

  it('Installieren: entpackt daneben, prüft Signatur, startet Tausch, beendet', async () => {
    const t = fakeTools({ zips: { 'neu.zip': buildJson(143) }, unpacked: buildJson(143) })
    const { u, states } = updater(t)
    await u.setFolder('/f')
    await u.install()
    const staged = '/Applications/.C2UI Update'
    expect(t.log).toContain(`ditto -x -k /f/neu.zip ${staged}`)
    expect(t.log).toContain(`codesign --verify -R =${REQ} ${staged}/C2UI.app`)
    expect(t.log).toContain(`xattr -dr com.apple.quarantine ${staged}/C2UI.app`)
    expect(t.detached).toEqual([
      '/bin/sh', '-c', SWAP_SCRIPT, 'app-update', '4711', '/Applications/C2UI.app', `${staged}/C2UI.app`, `${staged}/previous.app`, staged
    ])
    expect(t.quitted).toBe(true)
    expect(states.at(-1)).toBe('installing')
  })

  it.each([
    ['ditto', { dittoFails: 'ditto: Permission denied' }, 'Kein Platz für das Update neben der App: ditto: Permission denied'],
    ['alter Build im ZIP', { unpacked: buildJson(141) }, 'neu.zip enthält keine neuere C2UI.app'],
    ['ungültige Signatur', { verifyFails: 'a sealed resource is missing or invalid' }, 'Signatur der neuen App ungültig: a sealed resource is missing or invalid'],
    ['andere Signatur', { requirementFails: 'code failed to satisfy specified code requirement(s)' }, 'Die neue App ist anders signiert als die installierte: code failed to satisfy specified code requirement(s)']
  ])('Installieren scheitert (%s): klare Meldung, aufgeräumt, nicht getauscht', async (_n, extra, message) => {
    const t = fakeTools({ zips: { 'neu.zip': buildJson(143) }, unpacked: buildJson(143), ...extra })
    const { u } = updater(t)
    await u.setFolder('/f')
    await u.install()
    expect(u.state).toMatchObject({ state: 'failed', message })
    expect(t.detached).toBeUndefined()
    expect(t.quitted).toBe(false)
    expect(t.log.at(-1)).toBe('remove /Applications/.C2UI Update')
  })
})

// ---------- Tausch-Skript echt ----------

function swapFixture(withNew: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'c2ui-swap-'))
  const app = join(dir, 'Alt.app')
  mkdirSync(app)
  writeFileSync(join(app, 'version'), 'alt')
  const staged = join(dir, '.Update')
  mkdirSync(staged)
  const fresh = join(staged, 'Neu.app')
  if (withNew) {
    mkdirSync(fresh)
    writeFileSync(join(fresh, 'version'), 'neu')
  }
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const openLog = join(dir, 'open.log')
  writeFileSync(join(bin, 'open'), `#!/bin/sh\necho "$@" >> "${openLog}"\n`)
  chmodSync(join(bin, 'open'), 0o755)
  return { dir, app, staged, fresh, bin, openLog }
}

async function runSwap(f: ReturnType<typeof swapFixture>): Promise<number> {
  const sleeper = spawn('sleep', ['1'])
  const started = Date.now()
  // Asynchron, damit Node den beendeten sleep abräumt (sonst bleibt er als Zombie „lebendig“ für kill -0).
  await promisify(execFile)('/bin/sh', ['-c', SWAP_SCRIPT, 'app-update', String(sleeper.pid), f.app, f.fresh, join(f.staged, 'previous.app'), f.staged], {
    env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}` },
    timeout: 15_000
  })
  return Date.now() - started
}

describe('Tausch-Skript (echt)', () => {
  it('wartet auf das Ende der App, tauscht, räumt auf, öffnet', async () => {
    const f = swapFixture(true)
    const waited = await runSwap(f)
    expect(waited).toBeGreaterThan(700)
    expect(readFileSync(join(f.app, 'version'), 'utf8')).toBe('neu')
    expect(existsSync(f.staged)).toBe(false)
    expect(readFileSync(f.openLog, 'utf8').trim()).toBe(f.app)
  })

  it('ohne neue App kommt die alte zurück und wird geöffnet', async () => {
    const f = swapFixture(false)
    await runSwap(f)
    expect(readFileSync(join(f.app, 'version'), 'utf8')).toBe('alt')
    expect(existsSync(f.staged)).toBe(false)
    expect(readFileSync(f.openLog, 'utf8').trim()).toBe(f.app)
  })
})
