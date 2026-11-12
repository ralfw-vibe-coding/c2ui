import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Block } from '@shared/types'
import { childEnv } from '../env'
import type { AgentCallbacks, AgentContext, AgentFactory, AgentSession } from './types'

const MAX_TOOL_RESULT = 20_000

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
    try {
      const p = this.spawn()
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

  private spawn(): ChildProcessWithoutNullStreams {
    const chat = this.ctx.chat()
    const cfg = this.ctx.settings().agents.codex
    const common = [
      '--json',
      '--skip-git-repo-check',
      '-c', `sandbox_mode="${chat.permissionMode}"`,
      '-c', 'approval_policy="never"'
    ]
    if (cfg.model) common.push('-m', cfg.model)
    const args = chat.sessionStarted
      ? ['exec', 'resume', ...common, chat.sessionId, '-']
      : ['exec', ...common, '-']

    const cmd = cfg.path || 'codex'
    const p = spawn(cmd, args, { cwd: chat.cwd, env: childEnv(this.ctx.path) })
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
      if (this.turnEnded) return
      if (this.interrupted) this.endTurn(true, 'Abgebrochen.')
      else {
        const detail = lastErrorLines(this.stderrTail) || `Exit-Code ${code ?? signal}`
        this.endTurn(true, `Codex CLI wurde ohne Abschluss beendet: ${detail}`)
      }
    })
    return p
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
        this.endTurn(false)
        return
      case 'turn.failed':
        this.endTurn(true, m.error?.message ?? 'Turn fehlgeschlagen')
        return
      case 'error':
        this.cb.onEvent({ kind: 'error', id: randomUUID(), text: String(m.message ?? 'Fehler') })
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
        if (completed) this.cb.onEvent({ kind: 'error', id, text: String(item.message ?? 'Fehler') })
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
      errorText
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
      return {
        name: `${item.server ?? 'mcp'}.${item.tool ?? ''}`,
        input: item.arguments ?? {},
        result: item.error?.message ?? JSON.stringify(item.result ?? '', null, 2),
        isError: item.status === 'failed' || !!item.error
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
