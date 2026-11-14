import type { Block } from './types'

/**
 * Aufgabenliste des Agenten: Claude führt sie über das Werkzeug `TodoWrite`, Codex über
 * `update_plan` (Item `plan`). Beide kennen dieselben drei Zustände. Statt den Aufruf als
 * nackten Arbeitsschritt durchlaufen zu lassen, zeigt C2UI die Liste – so ist der Fortschritt
 * eines langen Turns ablesbar.
 */

export type TodoStatus = 'pending' | 'doing' | 'done'

export interface TodoStep {
  text: string
  status: TodoStatus
}

/** Werkzeuge, die eine Aufgabenliste schreiben. */
const TOOLS = new Set(['todowrite', 'todo_write', 'update_plan', 'updateplan', 'plan'])

/** Felder, unter denen die Liste stehen kann (Claude: todos, Codex: plan). */
const LISTS = ['todos', 'plan', 'steps', 'items', 'tasks']

/** Felder, unter denen der Text eines Schritts stehen kann. */
const TEXTS = ['content', 'step', 'text', 'title', 'task', 'description', 'activeForm']

function statusOf(v: unknown): TodoStatus {
  const s = String(v ?? '').toLowerCase()
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'finished') return 'done'
  if (s === 'in_progress' || s === 'in-progress' || s === 'inprogress' || s === 'active' || s === 'running' || s === 'doing') return 'doing'
  return 'pending'
}

function stepOf(v: unknown): TodoStep | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim(), status: 'pending' } : null
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  for (const k of TEXTS) {
    const t = o[k]
    if (typeof t === 'string' && t.trim()) return { text: t.trim(), status: statusOf(o.status ?? o.state) }
  }
  return null
}

/**
 * Die Aufgabenliste eines Werkzeugaufrufs – oder `null`, wenn der Aufruf keine ist.
 * Unbekannte Felder werden geduldig abgeklopft, damit neue CLI-Fassungen nichts kaputt machen.
 */
export function todoSteps(name: string, input: unknown): TodoStep[] | null {
  if (!TOOLS.has(name.toLowerCase().replace(/^mcp__.*__/, ''))) return null
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  for (const key of LISTS) {
    const list = o[key]
    if (!Array.isArray(list) || !list.length) continue
    const steps = list.map(stepOf).filter((s): s is TodoStep => !!s)
    if (steps.length) return steps
  }
  return null
}

/** Ist dieser Block eine Aufgabenliste? */
export function isTodoCall(b: Block): boolean {
  return b.type === 'tool_use' && !!todoSteps(b.name, b.input)
}

/** Kurzstand für Kopfzeilen: „3/6 · Prüfung schreiben“. */
export function todoProgress(steps: TodoStep[]): { done: number; total: number; current?: string } {
  const done = steps.filter((s) => s.status === 'done').length
  const current = steps.find((s) => s.status === 'doing')?.text ?? steps.find((s) => s.status === 'pending')?.text
  return { done, total: steps.length, ...(current ? { current } : {}) }
}
