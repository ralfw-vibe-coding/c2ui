/** Ersetzt das Home-Verzeichnis durch ~. */
export function tildify(p: string, home: string): string {
  return home && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p
}

/**
 * Verzeichnis für die Anzeige: mit ~ und abschließendem „/“, höchstens `max` Zeichen.
 * Gekürzt wird vorne an Pfadgrenzen („…/Vibe Coding/Claude2UI/“), damit das Ende lesbar bleibt.
 */
export function displayDir(p: string, home: string, max = 28): string {
  const s = tildify(p, home).replace(/\/+$/, '') + '/'
  if (s.length <= max) return s
  const parts = s.slice(0, -1).split('/')
  let out = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const next = parts[i] + '/' + out
    if (('…/' + next).length > max) break
    out = next
  }
  if (!out) {
    // Schon der letzte Ordnername ist zu lang: von vorne kürzen.
    const last = parts[parts.length - 1] + '/'
    return '…' + last.slice(last.length - (max - 1))
  }
  return '…/' + out
}

/** So viele zuletzt benutzte Arbeitsverzeichnisse merkt sich die App. */
export const RECENT_DIRS = 12

/** Liste ohne Dubletten und Leereinträge, Reihenfolge bleibt (neuestes zuerst), höchstens `max`. */
export function recentDirs(dirs: readonly string[], max = RECENT_DIRS): string[] {
  const out: string[] = []
  for (const d of dirs) {
    const dir = typeof d === 'string' ? d.replace(/\/+$/, '') : ''
    if (dir && !out.includes(dir)) out.push(dir)
  }
  return out.slice(0, max)
}

/** Verzeichnis nach vorn in die Liste der zuletzt benutzten. */
export function withRecentDir(dirs: readonly string[], dir: string, max = RECENT_DIRS): string[] {
  return recentDirs([dir, ...dirs], max)
}
