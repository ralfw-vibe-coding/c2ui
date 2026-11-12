import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chatModel, type Block } from '@shared/types'
import { codexConfigDefaultModel } from '../models'
import { childEnv } from '../env'
import { codexA2uiLaunch } from './a2ui'
import type { AgentCallbacks, AgentContext, AgentFactory, AgentSession } from './types'

const MAX_TOOL_RESULT = 20_000
const RESUME_UNSUPPORTED = /thread\/resume failed|paginated_threads is not supported/i

/**
 * Codex-CLI-Adapter.
 * Pro Turn ein `codex exec --json`-Prozess; ab dem zweiten Turn `codex exec resume <threadId>`.
 * Codex startet schnell genug, ein dauerhafter Prozess lohnt sich hier nicht.
 * Der Prompt geht über stdin (`-`), damit Länge und Sonderzeichen keine Rolle spielen.
 */
class CodexSession implements AgentSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private stderrTail = ''
  private _busy = false
  private interrupted = false
  private turnEnded = false
  private turnStartedAt = 0
  /** Alle Items eines Turns landen in einer Assistant-Nachricht. */
  private msgId = ''
  private seenTools = new Set<string>()
  private turnModel: string | undefined
  /**
   * Ergebnis aus turn.completed/turn.failed. Der Turn gilt erst als beendet, wenn der Prozess
   * sich beendet hat: Codex räumt danach noch auf und hält so lange die Session. Ein sofort
   * gestarteter `resume` würde sonst ohne Ausgabe abbrechen.
   */
  private pendingEnd: { isError: boolean; errorText?: string } | null = null
  private closeTimer: NodeJS.Timeout | null = null
  private lastNotice = ''
  /** Text des laufenden Turns (für den Neustart ohne resume). */
  private turnText = ''
  /** Der laufende Prozess setzt eine bestehende Session fort. */
  private resuming = false
  private retried = false

  constructor(
    private readonly ctx: AgentContext,
    private readonly cb: AgentCallbacks
  ) {}

  get busy(): boolean {
    return this._busy
  }

  send(text: string): void {
    if (this._busy) throw new Error('Chat ist beschäftigt')
    this.setBusy(true)
    this.interrupted = false
    this.turnEnded = false
    this.turnStartedAt = Date.now()
    this.msgId = 'codex-' + randomUUID()
    this.seenTools.clear()
    this.pendingEnd = null
    this.lastNotice = ''
    this.turnText = text
    this.retried = false
    try {
      const p = this.spawn(false)
      p.stdin.end(text)
    } catch (err) {
      this.endTurn(true, String((err as Error).message ?? err))
    }
  }

  interrupt(): void {
    if (!this._busy || !this.proc) return
    this.interrupted = true
    const p = this.proc
    p.kill('SIGINT')
    setTimeout(() => {
      if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL')
    }, 3000)
  }

  dispose(): void {
    if (this.proc) {
      this.proc.removeAllListeners()
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    if (this._busy) this.setBusy(false)
  }

  // ---------------------------------------------------------------------------

  /** @param fresh true = neue Session starten, auch wenn der Chat schon eine hat. */
  private spawn(fresh: boolean): ChildProcessWithoutNullStreams {
    const chat = this.ctx.chat()
    const cfg = this.ctx.settings().agents.codex
    const common = [
      '--json',
      '--skip-git-repo-check',
      '-c', `sandbox_mode="${chat.permissionMode}"`,
      '-c', 'approval_policy="never"'
    ]
    const model = chatModel(chat, this.ctx.settings())
    if (model) common.push('-m', model)
    this.turnModel = model || codexConfigDefaultModel()
    // A2UI: Skill über Schatten-Home, MCP-Server per -c (bei jedem Start, auch bei resume).
    const a2ui = this.ctx.a2ui?.()
    const launch = a2ui ? codexA2uiLaunch(a2ui) : { args: [], env: {} }
    common.push(...launch.args)
    this.resuming = chat.sessionStarted && !fresh
    const args = this.resuming
      ? ['exec', 'resume', ...common, chat.sessionId, '-']
      : ['exec', ...common, '-']

    const cmd = cfg.path || 'codex'
    const p = spawn(cmd, args, { cwd: chat.cwd, env: { ...childEnv(this.ctx.path), ...launch.env } })
    this.proc = p
    this.buf = ''
    this.stderrTail = ''

    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (d: string) => this.onData(d))
    p.stderr.setEncoding('utf8')
    p.stderr.on('data', (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-4000)
    })
    p.on('error', (err) => {
      if (this.proc === p) this.proc = null
      const msg =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `Codex CLI nicht gefunden („${cmd}“). Pfad in den Einstellungen prüfen.`
          : `Codex CLI konnte nicht gestartet werden: ${err.message}`
      this.endTurn(true, msg)
    })
    // 'close' statt 'exit': erst dann sind alle stdout-Daten gelesen.
    p.on('close', (code, signal) => {
      if (this.buf.trim()) this.onData('\n')
      if (this.proc === p) this.proc = null
      if (this.closeTimer) clearTimeout(this.closeTimer)
      this.closeTimer = null
      if (this.turnEnded) return
      if (!this.pendingEnd && !this.interrupted && this.resuming && !this.retried && RESUME_UNSUPPORTED.test(this.stderrTail)) {
        this.restartWithHistory()
        return
      }
      if (this.pendingEnd) {
        this.emitGeneratedImages()
        this.endTurn(this.pendingEnd.isError, this.pendingEnd.errorText)
      }
      else if (this.interrupted) this.endTurn(true, 'Abgebrochen.')
      else {
        const detail = this.lastNotice || lastErrorLines(this.stderrTail) || `Exit-Code ${code ?? signal}`
        this.endTurn(true, `Codex CLI wurde ohne Abschluss beendet: ${detail}`)
      }
    })
    return p
  }

  /**
   * Codex kann manche Threads nicht per `exec resume` fortsetzen („paginated_threads is not
   * supported yet“ – Codex stellt ältere Threads im Hintergrund auf ein neues Format um).
   * Dann startet ein neuer Thread, der den bisherigen Verlauf aus dem Transkript der App erhält.
   */
  private restartWithHistory(): void {
    this.retried = true
    this.cb.onEvent({
      kind: 'notice',
      id: randomUUID(),
      text:
        'Codex kann diese Session nicht fortsetzen (Codex hat sie in ein Format überführt, das „codex exec resume“ noch nicht unterstützt). ' +
        'Der Chat geht in einer neuen Codex-Session weiter, die den bisherigen Verlauf als Kontext bekommt.'
    })
    const history = this.ctx.history?.() ?? ''
    const prompt = history
      ? `Dies ist die Fortsetzung eines früheren Gesprächs, dessen Codex-Session nicht fortgesetzt werden konnte.\n` +
        `Bisheriger Verlauf (vom Client mitgeschrieben, ggf. gekürzt):\n<verlauf>\n${history}\n</verlauf>\n\n` +
        `Aktuelle Nachricht des Nutzers:\n${this.turnText}`
      : this.turnText
    try {
      const p = this.spawn(true)
      p.stdin.end(prompt)
    } catch (err) {
      this.endTurn(true, String((err as Error).message ?? err))
    }
  }

  /**
   * Die Bildgenerierung von Codex taucht nicht als eigenes Ereignis auf; Codex legt die Bilder
   * unter $CODEX_HOME/generated_images/<thread>/ ab. Neue Bilder dieses Turns werden angezeigt.
   */
  private emitGeneratedImages(): void {
    const thread = this.ctx.chat().sessionId
    const dir = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', thread)
    let files: string[] = []
    try {
      files = readdirSync(dir)
        .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
        .map((f) => join(dir, f))
        .filter((f) => statSync(f).mtimeMs >= this.turnStartedAt - 1000)
        .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
    } catch {
      return
    }
    if (files.length) this.addBlocks(files.map((path) => ({ type: 'image' as const, path })))
  }

  private onData(d: string): void {
    this.buf += d
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line.startsWith('{')) continue
      try {
        this.handle(JSON.parse(line))
      } catch {
        /* unvollständige oder fremde Zeile */
      }
    }
  }

  private handle(m: any): void {
    switch (m.type) {
      case 'thread.started':
        if (m.thread_id) this.cb.onEvent({ kind: 'session', sessionId: m.thread_id })
        return
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        this.handleItem(m.item, m.type === 'item.completed')
        return
      case 'turn.completed':
        this.finishAfterExit({ isError: false })
        return
      case 'turn.failed':
        this.finishAfterExit({ isError: true, errorText: m.error?.message ?? 'Turn fehlgeschlagen' })
        return
      case 'error':
        // Codex meldet auch Warnungen so (z. B. Modellwechsel beim Fortsetzen). Ob es ein echter
        // Fehler war, zeigt erst turn.failed bzw. ein Abbruch ohne turn.completed.
        this.notice(String(m.message ?? 'Fehler'))
        return
    }
  }

  private handleItem(item: any, completed: boolean): void {
    if (!item?.type) return
    const id = `${this.msgId}-${item.id}`
    switch (item.type) {
      case 'agent_message':
        if (completed && item.text) this.addBlocks([{ type: 'text', text: item.text }])
        return
      case 'reasoning':
        if (completed && item.text) this.addBlocks([{ type: 'thinking', text: item.text }])
        return
      case 'error':
        if (completed) this.notice(String(item.message ?? 'Fehler'), id)
        return
      default: {
        const tool = toolOf(item)
        if (!tool) return
        if (!this.seenTools.has(id)) {
          this.seenTools.add(id)
          this.addBlocks([{ type: 'tool_use', id, name: tool.name, input: tool.input }])
        }
        if (completed) {
          this.cb.onEvent({ kind: 'tool-result', toolUseId: id, content: truncate(tool.result), isError: tool.isError })
        }
      }
    }
  }

  private notice(text: string, id: string = randomUUID()): void {
    this.lastNotice = text
    this.cb.onEvent({ kind: 'notice', id, text })
  }

  private finishAfterExit(end: { isError: boolean; errorText?: string }): void {
    this.pendingEnd = end
    const p = this.proc
    if (!p) return this.endTurn(end.isError, end.errorText)
    // Sicherheitsnetz, falls Codex nach dem Turn nicht von selbst endet.
    this.closeTimer = setTimeout(() => {
      if (p.exitCode === null && p.signalCode === null) p.kill('SIGTERM')
    }, 5000)
  }

  private addBlocks(blocks: Block[]): void {
    this.cb.onEvent({ kind: 'assistant', msgId: this.msgId, blocks })
  }

  private endTurn(isError: boolean, errorText?: string): void {
    if (this.turnEnded || !this._busy) return
    this.turnEnded = true
    this.cb.onEvent({
      kind: 'turn-end',
      id: randomUUID(),
      durationMs: Date.now() - this.turnStartedAt,
      isError,
      errorText,
      model: this.turnModel
    })
    this.setBusy(false)
  }

  private setBusy(b: boolean): void {
    this._busy = b
    this.cb.onBusy(b)
  }
}

/** Übersetzt Codex-Items, die Werkzeugen entsprechen, in einen Tool-Block. */
function toolOf(item: any): { name: string; input: unknown; result: string; isError: boolean } | null {
  switch (item.type) {
    case 'command_execution':
      return {
        name: 'Shell',
        input: { command: unwrapShell(item.command) },
        result: item.aggregated_output ?? '',
        isError: item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
      }
    case 'file_change':
      return {
        name: 'Dateien',
        input: { description: (item.changes ?? []).map((c: any) => `${c.kind ?? ''} ${c.path ?? ''}`.trim()).join(', '), changes: item.changes },
        result: item.status ?? '',
        isError: item.status === 'failed'
      }
    case 'mcp_tool_call':
      // Benennung wie bei Claude (mcp__server__tool), damit z. B. A2UI-Aufrufe gleich erkannt werden.
      return {
        name: `mcp__${item.server ?? 'mcp'}__${item.tool ?? ''}`,
        input: item.arguments ?? {},
        result: item.error?.message ?? mcpResultText(item.result),
        isError: item.status === 'failed' || !!item.error || !!item.result?.is_error || !!item.result?.isError
      }
    case 'web_search':
      return { name: 'WebSearch', input: { query: item.query }, result: '', isError: false }
    case 'todo_list':
      return {
        name: 'Plan',
        input: { description: `${(item.items ?? []).length} Schritte`, items: item.items },
        result: (item.items ?? []).map((t: any) => `${t.completed ? '✓' : '○'} ${t.text}`).join('\n'),
        isError: false
      }
    default:
      return null
  }
}

/** Text eines MCP-Ergebnisses ({content: [{type: 'text', text}]}) für die Anzeige. */
function mcpResultText(r: any): string {
  if (!r) return ''
  if (Array.isArray(r.content)) {
    return r.content.map((c: any) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n')
  }
  return JSON.stringify(r, null, 2)
}

/** `/bin/zsh -lc "sed -n ..."` → `sed -n ...` für eine lesbare Zusammenfassung. */
function unwrapShell(cmd: unknown): string {
  const s = String(cmd ?? '')
  const m = s.match(/^\S*sh -l?c (["'])([\s\S]*)\1$/)
  return m ? m[2] : s
}

function truncate(s: string): string {
  return s.length > MAX_TOOL_RESULT ? s.slice(0, MAX_TOOL_RESULT) + '\n… (gekürzt)' : s
}

function lastErrorLines(stderr: string): string {
  return stderr
    .split('\n')
    .filter((l) => l.trim() && !/rmcp::transport/.test(l))
    .slice(-3)
    .join('\n')
}

export const createCodexSession: AgentFactory = (ctx, cb) => new CodexSession(ctx, cb)
