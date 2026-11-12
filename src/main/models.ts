import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentKind, ModelList } from '@shared/types'
import { childEnv } from './env'

/** Claude hat keinen abfragbaren Katalog; die CLI kennt diese Kurznamen für das jeweils neueste Modell. */
const CLAUDE_ALIASES = [
  { value: 'fable', label: 'Fable' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]

const cache = new Map<AgentKind, Promise<ModelList>>()

/** Standardmodell aus ~/.codex/config.toml (für die Anzeige, welches Modell geantwortet hat). */
export function codexConfigDefaultModel(): string | undefined {
  try {
    const toml = readFileSync(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml'), 'utf8')
    return toml.match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1]
  } catch {
    return undefined
  }
}

export function listModels(agent: AgentKind, binPath: string, path: string): Promise<ModelList> {
  let p = cache.get(agent)
  if (!p) {
    p = agent === 'claude' ? claudeModels() : codexModels(binPath, path)
    // Fehlschläge nicht cachen, damit ein erneutes Öffnen es wieder versucht.
    p.then((r) => r.error && cache.delete(agent))
    cache.set(agent, p)
  }
  return p
}

async function claudeModels(): Promise<ModelList> {
  let cliDefault: string | undefined
  try {
    const s = JSON.parse(await readFile(join(homedir(), '.claude/settings.json'), 'utf8'))
    if (typeof s.model === 'string' && s.model) cliDefault = s.model
  } catch {
    /* keine Einstellungsdatei */
  }
  return { options: CLAUDE_ALIASES, cliDefault }
}

async function codexModels(binPath: string, path: string): Promise<ModelList> {
  let cliDefault: string | undefined
  try {
    const toml = await readFile(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml'), 'utf8')
    cliDefault = toml.match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1]
  } catch {
    /* keine config.toml */
  }
  try {
    const out = await new Promise<string>((resolve, reject) =>
      execFile(binPath || 'codex', ['debug', 'models'], { env: childEnv(path), timeout: 20_000, maxBuffer: 20e6 }, (err, stdout) =>
        err ? reject(err) : resolve(stdout)
      )
    )
    const models: any[] = JSON.parse(out).models ?? []
    const options = models
      .filter((m) => m?.slug && m.visibility === 'list')
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((m) => ({ value: String(m.slug), label: String(m.display_name ?? m.slug) }))
    return { options, cliDefault }
  } catch (err) {
    return { options: [], cliDefault, error: `Modellliste von Codex nicht abrufbar: ${(err as Error).message}` }
  }
}
