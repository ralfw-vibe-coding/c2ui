import type { Block } from './types'

/**
 * Arbeit, die weiterläuft, nachdem ein Turn zu Ende ist: Claude startet mit `Bash` und
 * `run_in_background` einen Befehl, der Turn endet, und sobald der Befehl fertig ist, meldet die
 * CLI das dem Agenten – der dann von selbst weiterarbeitet. Ohne Anzeige wirkt das, als käme später
 * Text aus dem Nichts. C2UI merkt sich deshalb, was läuft.
 *
 * Start erkennt man am Werkzeugaufruf, das Ende an der Meldung der CLI (`<task-notification>`);
 * beide nennen dieselbe `tool_use`-Id, das ist der verlässliche Schlüssel.
 */

export interface BackgroundTask {
  /** Id des Werkzeugaufrufs, der den Befehl gestartet hat. */
  id: string
  /** Was läuft da (Beschreibung des Aufrufs, sonst der Befehl). */
  label: string
  startedAt: number
}

/** „true“ kommt je nach CLI-Fassung als Wahrheitswert oder als Text. */
function isTrue(v: unknown): boolean {
  return v === true || (typeof v === 'string' && v.toLowerCase() === 'true')
}

/** Startet dieser Block einen Befehl im Hintergrund? Dann die Aufgabe, sonst `null`. */
export function startedTask(block: Block, now = Date.now()): BackgroundTask | null {
  if (block.type !== 'tool_use' || !isTrue((block.input as Record<string, unknown> | undefined)?.run_in_background)) return null
  const input = (block.input ?? {}) as Record<string, unknown>
  const label = [input.description, input.command].find((v): v is string => typeof v === 'string' && !!v.trim()) ?? 'Hintergrundbefehl'
  return { id: block.id, label: label.trim().replace(/\s+/g, ' ').slice(0, 120), startedAt: now }
}

export interface TaskReport {
  /** Id des startenden Werkzeugaufrufs, soweit genannt. */
  toolUseId?: string
  /** Id, die die CLI dem Hintergrundbefehl gegeben hat. */
  taskId?: string
  /** `completed`, `failed`, … – wie die CLI es nennt. */
  status: string
  summary?: string
}

const tag = (text: string, name: string): string | undefined => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim()

/**
 * Meldungen der CLI über fertige Hintergrundbefehle. Sie stecken im Text einer Nutzernachricht,
 * die der Agent bekommt, nicht der Mensch – deshalb liest C2UI sie mit.
 */
export function taskReports(text: string): TaskReport[] {
  const out: TaskReport[] = []
  for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1]
    out.push({
      toolUseId: tag(body, 'tool-use-id'),
      taskId: tag(body, 'task-id'),
      status: tag(body, 'status') ?? 'completed',
      summary: tag(body, 'summary')
    })
  }
  return out
}

/** Die Id, die die CLI beim Start gemeldet hat („Command running in background with ID: …“). */
export function taskIdOf(result: string): string | undefined {
  return /running in background with ID:\s*([A-Za-z0-9_-]+)/.exec(result)?.[1]
}

/** Erledigte Aufgaben aus der Liste nehmen (über die Id des Aufrufs oder die der CLI). */
export function withoutReported(tasks: BackgroundTask[], reports: TaskReport[], taskIds: Map<string, string> = new Map()): BackgroundTask[] {
  if (!reports.length) return tasks
  const gone = new Set<string>()
  for (const r of reports) {
    if (r.toolUseId) gone.add(r.toolUseId)
    if (r.taskId && taskIds.has(r.taskId)) gone.add(taskIds.get(r.taskId)!)
  }
  return tasks.filter((t) => !gone.has(t.id))
}
