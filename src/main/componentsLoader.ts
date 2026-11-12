import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_COMPONENT_NAMES } from '@shared/a2ui'
import { parseCompositeDef, type CompositeDef } from '@shared/a2ui-composites'

export interface LoadedComponents {
  defs: CompositeDef[]
  /** Fehler je Datei, z. B. „ContactCard/component.json: …“. */
  errors: string[]
}

/** Lädt alle eigenen Komponenten aus `<dir>/<Name>/component.json`. Fehlerhafte werden übersprungen. */
export function loadComposites(dir: string): LoadedComponents {
  const defs: CompositeDef[] = []
  const errors: string[] = []
  const reserved = new Set(BUILTIN_COMPONENT_NAMES)
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return { defs, errors }
  }
  for (const name of entries.sort()) {
    const file = join(dir, name, 'component.json')
    if (!existsSync(file)) continue
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push(`${name}/component.json: kein gültiges JSON (${(e as Error).message})`)
      continue
    }
    const r = parseCompositeDef(raw, reserved)
    if (!r.def) errors.push(...r.errors.map((e) => `${name}/component.json: ${e}`))
    else if (defs.some((d) => d.name === r.def!.name)) errors.push(`${name}/component.json: Name „${r.def.name}“ doppelt.`)
    else defs.push(r.def)
  }
  return { defs, errors }
}

/** Legt den Komponenten-Ordner beim ersten Start mit Beispiel und Anleitung an. */
export function ensureComponentsDir(dir: string, examplesDir: string, readme: string): void {
  if (existsSync(dir)) return
  mkdirSync(dir, { recursive: true })
  try {
    cpSync(examplesDir, dir, { recursive: true })
  } catch {
    /* Beispiele sind optional */
  }
  writeFileSync(join(dir, 'README.md'), readme)
}
