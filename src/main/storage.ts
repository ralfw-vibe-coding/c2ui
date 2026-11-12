import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Einfache JSON-Ablage im userData-Verzeichnis mit verzögertem, atomarem Schreiben. */
export class Storage {
  private pending = new Map<string, { timer: NodeJS.Timeout; value: unknown }>()

  constructor(private readonly baseDir: string) {
    mkdirSync(join(baseDir, 'transcripts'), { recursive: true })
  }

  private file(key: string): string {
    return join(this.baseDir, `${key}.json`)
  }

  read<T>(key: string, fallback: T): T {
    const p = this.pending.get(key)
    if (p) return p.value as T
    try {
      return JSON.parse(readFileSync(this.file(key), 'utf8')) as T
    } catch {
      return fallback
    }
  }

  /** Schreibt verzögert (Standard 300 ms); mehrfaches Schreiben wird zusammengefasst. */
  write(key: string, value: unknown, delayMs = 300): void {
    const p = this.pending.get(key)
    if (p) clearTimeout(p.timer)
    const timer = setTimeout(() => this.flushKey(key), delayMs)
    this.pending.set(key, { timer, value })
  }

  remove(key: string): void {
    const p = this.pending.get(key)
    if (p) clearTimeout(p.timer)
    this.pending.delete(key)
    rmSync(this.file(key), { force: true })
  }

  private flushKey(key: string): void {
    const p = this.pending.get(key)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(key)
    const f = this.file(key)
    mkdirSync(dirname(f), { recursive: true })
    const tmp = `${f}.tmp`
    writeFileSync(tmp, JSON.stringify(p.value, null, 2))
    renameSync(tmp, f)
  }

  flush(): void {
    for (const key of [...this.pending.keys()]) this.flushKey(key)
  }
}
