import { basename, dirname, join } from 'node:path'
import type { UpdateOffer, UpdateState } from '@shared/update'

/**
 * Selbst-Aktualisierung aus einem Ordner (z. B. geteilter Dropbox-Ordner oder dist/ des Repos):
 * ZIPs mit neuerem Build anbieten, Signatur gegen die installierte App prüfen, nach dem Beenden tauschen.
 * Kein Server, kein Apple-Entwicklerprogramm: Dateien, die Dropbox & Co. schreiben, tragen keine Quarantäne.
 */

/** Build-Angaben, die das Packskript in die App schreibt (Contents/Resources/build.json). */
export interface BuildInfo {
  version: string
  build: number
  commit?: string
  arch?: string
}

/** Wirkungen nach außen – in Tests durch Attrappen ersetzt. */
export interface UpdaterTools {
  /** Dateinamen in einem Ordner. */
  list(dir: string): Promise<string[]>
  /** Führt ein Programm aus und liefert stdout; bei Fehler ein Error mit stderr (sonst der Meldung) als Text. */
  run(command: string, args: string[]): Promise<string>
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
  /** Löscht Datei oder Ordner rekursiv; fehlt er, ist das kein Fehler. */
  remove(path: string): Promise<void>
  /** Startet einen Prozess abgekoppelt (überlebt das Beenden der App). */
  detach(command: string, args: string[]): void
  quit(): void
  now(): Date
}

export interface UpdaterOptions {
  tools: UpdaterTools
  /** Build der laufenden App; null = App aus dem Repo (aktualisiert sich nicht). */
  current: BuildInfo | null
  /** Ausführbare Datei der laufenden App (app.getPath('exe')). */
  exe: string
  pid: number
  /** Name des Bundles ohne .app, so liegt es auch oben im ZIP. */
  appName: string
  /** Lokale Einstellung (update.json in userData). */
  configFile: string
  onChange(state: UpdateState): void
}

// ---------- reine Funktionen ----------

/** Bundle aus der ausführbaren Datei: …/X.app/Contents/MacOS/X → …/X.app */
export function bundleOf(exe: string): string | undefined {
  const bundle = dirname(dirname(dirname(exe)))
  return bundle.endsWith('.app') && basename(dirname(exe)) === 'MacOS' ? bundle : undefined
}

/** Build-Angaben aus build.json eines ZIPs; undefined, wenn unlesbar oder für einen anderen Chip. */
export function offerOf(file: string, json: string, arch: string | undefined): UpdateOffer | undefined {
  let x: Record<string, unknown>
  try {
    x = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!x || typeof x !== 'object') return undefined
  const build = typeof x.build === 'number' ? x.build : typeof x.build === 'string' ? Number(x.build) : NaN
  if (!Number.isInteger(build) || build <= 0) return undefined
  // Fehlt arch (alte Builds), gilt das ZIP als passend.
  if (typeof x.arch === 'string' && arch && x.arch !== arch) return undefined
  return {
    version: typeof x.version === 'string' ? x.version : '?',
    build,
    file,
    ...(typeof x.commit === 'string' && x.commit ? { commit: x.commit } : {})
  }
}

/** Höchster Build, der größer als der laufende ist. */
export function newestOffer(offers: (UpdateOffer | undefined)[], build: number): UpdateOffer | undefined {
  let best: UpdateOffer | undefined
  for (const o of offers) if (o && o.build > build && (!best || o.build > best.build)) best = o
  return best
}

/** Designated requirement aus der stdout von `codesign -d -r-`. */
export function requirementOf(codesignOutput: string): string | undefined {
  const m = codesignOutput.match(/^designated => (.+)$/m)
  return m ? m[1].trim() : undefined
}

/**
 * Tausch nach dem Beenden: $1 PID der App, $2 installiertes Bundle, $3 neues Bundle,
 * $4 Ablage für das alte (im Staging-Ordner), $5 Staging-Ordner. Klappt der zweite mv nicht,
 * kommt die alte App zurück. Gestartet wird in jedem Fall.
 */
export const SWAP_SCRIPT = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
if mv "$2" "$4"; then if mv "$3" "$2"; then :; else mv "$4" "$2"; fi; fi
rm -rf "$5"
open "$2"`

const firstLine = (e: unknown): string =>
  String((e as Error)?.message ?? e)
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-2)
    .join(' ')

// ---------- Ablauf ----------

export class Updater {
  private folder: string | undefined
  private st: UpdateState
  private checking: Promise<void> | null = null

  constructor(private readonly o: UpdaterOptions) {
    this.st = o.current ? { state: 'off' } : { state: 'unavailable' }
  }

  get state(): UpdateState {
    return this.st
  }

  private set(s: UpdateState): void {
    this.st = s
    this.o.onChange(s)
  }

  private get innerPath(): string {
    return `${this.o.appName}.app/Contents/Resources/build.json`
  }

  /** Liest den gespeicherten Ordner und prüft einmal. */
  async init(): Promise<void> {
    if (!this.o.current) return
    try {
      const cfg = JSON.parse(await this.o.tools.read(this.o.configFile))
      if (typeof cfg?.folder === 'string' && cfg.folder) this.folder = cfg.folder
    } catch {
      /* noch keine Einstellung */
    }
    await this.check()
  }

  async setFolder(folder: string | undefined): Promise<UpdateState> {
    if (!this.o.current) return this.st
    this.folder = folder || undefined
    await this.o.tools.write(this.o.configFile, JSON.stringify(this.folder ? { folder: this.folder } : {}))
    await this.check()
    return this.st
  }

  async check(): Promise<UpdateState> {
    if (!this.o.current || this.st.state === 'installing') return this.st
    if (!this.folder) {
      this.set({ state: 'off' })
      return this.st
    }
    this.checking ??= this.doCheck(this.folder).finally(() => (this.checking = null))
    await this.checking
    return this.st
  }

  private async doCheck(folder: string): Promise<void> {
    const { tools, current } = this.o
    let files: string[]
    try {
      files = (await tools.list(folder)).filter((f) => f.toLowerCase().endsWith('.zip'))
    } catch (e) {
      this.set({ state: 'failed', folder, message: `Ordner nicht lesbar: ${firstLine(e)}` })
      return
    }
    const offers = await Promise.all(
      files.map(async (f) => {
        try {
          return offerOf(f, await tools.run('unzip', ['-p', join(folder, f), this.innerPath]), current!.arch)
        } catch {
          return undefined // anderes ZIP
        }
      })
    )
    if (this.folder !== folder || this.st.state === 'installing') return // inzwischen geändert
    const offer = newestOffer(offers, current!.build)
    const checked = tools.now().toISOString()
    this.set(offer ? { state: 'available', folder, checked, offer } : { state: 'current', folder, checked })
  }

  /** Entpackt, prüft und startet den Tausch; beendet danach die App. */
  async install(): Promise<UpdateState> {
    if (this.st.state !== 'available') return this.st
    const { tools, current, appName } = this.o
    const { folder, offer } = this.st
    const fail = async (message: string, staged?: string): Promise<UpdateState> => {
      if (staged) await tools.remove(staged).catch(() => {})
      this.set({ state: 'failed', folder, message })
      return this.st
    }
    const bundle = bundleOf(this.o.exe)
    if (!bundle) return fail(`Die laufende App liegt nicht in einem .app-Bundle: ${this.o.exe}`)
    this.set({ state: 'installing', folder, offer })

    // 1. Neben die installierte App entpacken (gleiches Volume → Tausch per mv).
    const staged = join(dirname(bundle), `.${appName} Update`)
    try {
      await tools.remove(staged)
      await tools.run('ditto', ['-x', '-k', join(folder, offer.file), staged])
    } catch (e) {
      return fail(`Kein Platz für das Update neben der App: ${firstLine(e)}`, staged)
    }
    const fresh = join(staged, `${appName}.app`)

    // 2. Build im Entpackten noch einmal prüfen.
    let again: UpdateOffer | undefined
    try {
      again = offerOf(offer.file, await tools.read(join(fresh, 'Contents/Resources/build.json')), current!.arch)
    } catch {
      again = undefined
    }
    if (!again || again.build <= current!.build) return fail(`${offer.file} enthält keine neuere ${appName}.app`, staged)

    // 3. Signatur: gültig und von derselben Identität wie die installierte App.
    try {
      await tools.run('codesign', ['--verify', '--deep', '--strict', fresh])
    } catch (e) {
      return fail(`Signatur der neuen App ungültig: ${firstLine(e)}`, staged)
    }
    let requirement: string | undefined
    try {
      requirement = requirementOf(await tools.run('codesign', ['-d', '-r-', bundle]))
    } catch (e) {
      return fail(`Signatur der installierten App nicht lesbar: ${firstLine(e)}`, staged)
    }
    if (!requirement) return fail('Die installierte App hat keine prüfbare Signatur.', staged)
    try {
      await tools.run('codesign', ['--verify', '-R', `=${requirement}`, fresh])
    } catch (e) {
      return fail(`Die neue App ist anders signiert als die installierte: ${firstLine(e)}`, staged)
    }

    // 4. Quarantäne entfernen – nur falls das ZIP doch aus einem Browser kam.
    await tools.run('xattr', ['-dr', 'com.apple.quarantine', fresh]).catch(() => {})

    // 5. Tausch abgekoppelt starten, dann beenden.
    tools.detach('/bin/sh', ['-c', SWAP_SCRIPT, 'app-update', String(this.o.pid), bundle, fresh, join(staged, 'previous.app'), staged])
    tools.quit()
    return this.st
  }
}
