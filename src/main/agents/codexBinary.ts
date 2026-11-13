import { execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Welche Codex-CLI benutzt wird.
 *
 * Die Codex-App (in ChatGPT.app) bringt eine eigene, meist neuere CLI mit und stellt Threads auf ein
 * „paginated“-Format um, das ältere CLIs weder fortsetzen noch lesen können. Ohne festen Pfad in den
 * Einstellungen nimmt C2UI deshalb die neueste vorhandene Version: aus dem PATH oder aus ChatGPT.app.
 */
export interface CodexBinary {
  path: string
  version: string
}

const BUNDLED = (): string[] => [
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
  join(homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex')
]

/** "codex-cli 0.167.0-alpha.3.2" → "0.167.0-alpha.3.2" */
export function parseCodexVersion(out: string): string | null {
  return out.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null
}

/** Vergleicht x.y.z; bei Gleichstand gewinnt die Version ohne Vorabkennung (alpha, beta …). */
export function compareVersions(a: string, b: string): number {
  const [ma, pa] = a.split('-', 2)
  const [mb, pb] = b.split('-', 2)
  const na = ma.split('.').map(Number)
  const nb = mb.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0)
    if (d) return d
  }
  if (!pa && pb) return 1
  if (pa && !pb) return -1
  return (pa ?? '').localeCompare(pb ?? '', undefined, { numeric: true })
}

/** Neueste Version aus einer Liste von Kandidaten. */
export function newest(candidates: CodexBinary[]): CodexBinary | null {
  return candidates.reduce<CodexBinary | null>((best, c) => (!best || compareVersions(c.version, best.version) > 0 ? c : best), null)
}

function executable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function onPath(envPath: string): string | null {
  for (const dir of envPath.split(':').filter(Boolean)) {
    const p = join(dir, 'codex')
    if (executable(p)) return p
  }
  return null
}

function versionOf(p: string, envPath: string): string | null {
  try {
    const out = execFileSync(p, ['--version'], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, PATH: envPath }, stdio: ['ignore', 'pipe', 'ignore'] })
    return parseCodexVersion(out)
  } catch {
    return null
  }
}

let cache: { key: string; at: number; value: CodexBinary } | null = null

/**
 * @param configured Pfad aus den Einstellungen (leer = automatisch)
 * @param envPath PATH der Login-Shell
 */
export function resolveCodexBinary(configured: string, envPath: string): CodexBinary {
  if (configured) return { path: configured, version: versionOf(configured, envPath) ?? '?' }
  const key = envPath
  if (cache && cache.key === key && Date.now() - cache.at < 5 * 60_000) return cache.value
  const paths = [onPath(envPath), ...BUNDLED().filter(executable)].filter((p): p is string => !!p)
  const found = paths.flatMap((path) => {
    const version = versionOf(path, envPath)
    return version ? [{ path, version }] : []
  })
  const value = newest(found) ?? { path: 'codex', version: '?' }
  cache = { key, at: Date.now(), value }
  return value
}
