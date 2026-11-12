import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Baut ein „Schatten-Home“ für Codex: ein Verzeichnis, dessen Einträge per Symlink auf das echte
 * Home zeigen – nur `.agents/skills` ist zusammengesetzt aus den eigenen Skills des Nutzers und
 * zusätzlichen Skills der App. Codex sucht Skills u. a. in `$HOME/.agents/skills`; es gibt keinen
 * Schalter, um einen Skill nur für einen Aufruf hinzuzufügen. So bleibt alles Echte unverändert.
 */
export function prepareShadowHome(dir: string, realHome: string, extraSkills: Record<string, string>): string {
  mkdirSync(join(dir, '.agents', 'skills'), { recursive: true })

  // 1. Alle Einträge des echten Homes (außer .agents) verlinken.
  for (const name of safeReaddir(realHome)) {
    if (name === '.agents') continue
    ensureLink(join(dir, name), join(realHome, name))
  }
  // 2. .agents: alles außer skills verlinken.
  const realAgents = join(realHome, '.agents')
  for (const name of safeReaddir(realAgents)) {
    if (name === 'skills') continue
    ensureLink(join(dir, '.agents', name), join(realAgents, name))
  }
  // 3. Skills: die des Nutzers plus die der App (die der App haben Vorrang).
  const skillsDir = join(dir, '.agents', 'skills')
  const realSkills = join(realAgents, 'skills')
  for (const name of safeReaddir(realSkills)) {
    if (extraSkills[name]) continue
    ensureLink(join(skillsDir, name), join(realSkills, name))
  }
  for (const [name, target] of Object.entries(extraSkills)) ensureLink(join(skillsDir, name), target)
  return dir
}

function safeReaddir(d: string): string[] {
  try {
    return readdirSync(d)
  } catch {
    return []
  }
}

/** Legt einen Symlink an bzw. korrigiert ihn, falls er woanders hinzeigt. Echte Dateien bleiben. */
function ensureLink(link: string, target: string): void {
  try {
    const st = lstatSync(link)
    if (!st.isSymbolicLink()) return
    if (readlinkSync(link) === target && existsSync(target)) return
    rmSync(link, { force: true })
  } catch {
    /* existiert noch nicht */
  }
  try {
    symlinkSync(target, link)
  } catch {
    /* z. B. Rechte – dann fehlt nur dieser Eintrag */
  }
}
