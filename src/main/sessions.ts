import { readdir, open, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Bestehende CLI-Sessions eines Arbeitsverzeichnisses finden, um sie in einem C2UI-Chat fortzusetzen.
 *
 * Claude legt je Verzeichnis einen Ordner `~/.claude/projects/<slug>/` an, darin je Session eine
 * `<sessionId>.jsonl`. Der Dateiname ist die ID für `claude --resume`.
 */

export interface SessionInfo {
  sessionId: string
  /** Erste Nutzernachricht, gekürzt (Titelvorschlag). */
  title: string
  /** Letzte Änderung (ms). */
  updatedAt: number
  bytes: number
}

/** Ordnername, den Claude aus einem Arbeitsverzeichnis bildet: alles außer Buchstaben/Ziffern wird zu „-“. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Ordner der Session-Logs; `CLAUDE_CONFIG_DIR` verschiebt Claudes Konfiguration aus dem Home. */
export function sessionsDir(home: string, cwd: string, configDir = process.env.CLAUDE_CONFIG_DIR): string {
  return join(configDir || join(home, '.claude'), 'projects', projectSlug(cwd))
}

/** Titel aus dem Anfang einer Logdatei: erste echte Nutzernachricht (kein Werkzeugergebnis, kein Subagent). */
export function titleFromLog(head: string, max = 80): string {
  for (const line of head.split('\n')) {
    if (!line.startsWith('{')) continue
    let o: Record<string, unknown>
    try {
      o = JSON.parse(line)
    } catch {
      continue // letzte Zeile womöglich abgeschnitten
    }
    if (o.type !== 'user' || o.isSidechain) continue
    const content = (o.message as { content?: unknown } | undefined)?.content
    const text = typeof content === 'string' ? content : ''
    const s = text.replace(/\s+/g, ' ').trim()
    if (!s || s.startsWith('<')) continue // z. B. eingefügte Systemhinweise
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }
  return ''
}

/** Anfang einer Datei lesen (für den Titel genügen ein paar Zeilen). */
async function head(file: string, bytes = 256 * 1024): Promise<string> {
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await fh.close()
  }
}

/** Sessions eines Verzeichnisses, neueste zuerst. Fehlt der Ordner, ist die Liste leer. */
export async function listClaudeSessions(home: string, cwd: string, configDir?: string): Promise<SessionInfo[]> {
  const dir = sessionsDir(home, cwd, configDir)
  let files: string[]
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }
  const infos = await Promise.all(
    files.map(async (f): Promise<SessionInfo | undefined> => {
      const file = join(dir, f)
      try {
        const st = await stat(file)
        if (!st.size) return undefined
        return { sessionId: f.slice(0, -'.jsonl'.length), title: titleFromLog(await head(file)), updatedAt: st.mtimeMs, bytes: st.size }
      } catch {
        return undefined
      }
    })
  )
  return infos.filter((i): i is SessionInfo => !!i).sort((a, b) => b.updatedAt - a.updatedAt)
}
