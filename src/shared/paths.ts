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
