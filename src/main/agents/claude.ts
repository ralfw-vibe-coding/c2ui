import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chatModel, type Attachment, type Block } from '@shared/types'
import { childEnv } from '../env'
import { claudeA2uiArgs, workshopPrompt } from './a2ui'
import { claudeImageBlocks, textWithAttachments } from './attachments'
import type { AgentCallbacks, AgentContext, AgentFactory, AgentSession } from './types'

const MAX_TOOL_RESULT = 20_000

/**
 * Claude-CLI-Adapter.
 * Hält pro Chat einen `claude -p --input-format stream-json`-Prozess, der mehrere Turns
 * bedient (spart ~3 s Kaltstart pro Turn). Nach Leerlauf wird er beendet und beim
 * nächsten Turn mit `--resume <sessionId>` neu gestartet.
 */
class ClaudeSession implements AgentSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf = ''
  private stderrTail = ''
  private idleTimer: NodeJS.Timeout | null = null
  private _busy = false
  private interrupted = false
  private turnStartedAt = 0
  // Streaming-Zustand der aktuellen API-Nachricht
  private curMsgId = ''
  private curIndex = 0
  /** Modell laut letzter Assistant-Nachricht (exakte ID von der API). */
  private lastModel: string | undefined

  constructor(
    private readonly ctx: AgentContext,
    private readonly cb: AgentCallbacks
  ) {}

  get busy(): boolean {
    return this._busy
  }

  send(text: string, attachments: Attachment[] = []): void {
    if (this._busy) throw new Error('Chat ist beschäftigt')
    this.clearIdle()
    this.setBusy(true)
    this.interrupted = false
    this.turnStartedAt = Date.now()
    try {
      const p = this.proc ?? this.spawn()
      const body = textWithAttachments(text, attachments)
      const images = claudeImageBlocks(attachments)
      const content = images.length ? [{ type: 'text', text: body }, ...images] : body
      p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n')
    } catch (err) {
      this.failTurn(String((err as Error).message ?? err))
    }
  }

  interrupt(): void {
    if (!this._busy || !this.proc) return
    this.interrupted = true
    this.proc.kill('SIGINT')
    // Falls der Prozess nicht reagiert, hart beenden.
    const p = this.proc
    setTimeout(() => {
      if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL')
    }, 3000)
  }

  dispose(): void {
    this.clearIdle()
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
    const settings = this.ctx.settings()
    const path = this.ctx.path
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', chat.permissionMode
    ]
    const cfg = settings.agents.claude
    const model = chatModel(chat, settings)
    if (model) args.push('--model', model)
    const a2ui = this.ctx.a2ui?.()
    if (a2ui) args.push(...claudeA2uiArgs(a2ui))
    const att = this.ctx.attachmentsDir?.()
    if (att) args.push('--add-dir', att)
    if (a2ui && chat.purpose === 'component-workshop') args.push('--append-system-prompt', workshopPrompt(a2ui.componentsDir))
    if (chat.sessionStarted) args.push('--resume', chat.sessionId)
    else args.push('--session-id', chat.sessionId)

    const cmd = cfg.path || 'claude'
    const p = spawn(cmd, args, { cwd: chat.cwd, env: childEnv(path) })
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
      this.proc = null
      const msg =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `Claude CLI nicht gefunden („${cmd}“). Pfad in den Einstellungen prüfen.`
          : `Claude CLI konnte nicht gestartet werden: ${err.message}`
      if (this._busy) this.failTurn(msg)
    })
    // 'close' statt 'exit': erst dann sind alle stdout-Daten gelesen.
    p.on('close', (code, signal) => {
      if (this.proc === p) this.proc = null
      if (!this._busy) return
      if (this.interrupted) {
        this.endTurn({ isError: true, errorText: 'Abgebrochen.' })
      } else {
        const detail = this.stderrTail.trim() || `Exit-Code ${code ?? signal}`
        this.failTurn(`Claude CLI wurde unerwartet beendet: ${detail}`)
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
      if (!line) continue
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      this.handle(msg)
    }
  }

  private handle(m: any): void {
    // Nachrichten von Subagenten (Task-Tool) zeigen wir in Inkrement 1 nicht einzeln.
    if (m.parent_tool_use_id) return

    switch (m.type) {
      case 'system':
        if (m.subtype === 'init' && m.session_id) this.cb.onEvent({ kind: 'session', sessionId: m.session_id })
        return

      case 'stream_event': {
        const e = m.event
        if (e?.type === 'message_start') {
          this.curMsgId = e.message?.id ?? randomUUID()
          this.curIndex = 0
        } else if (e?.type === 'content_block_start') {
          this.curIndex = e.index ?? 0
        } else if (e?.type === 'content_block_delta') {
          const dt = e.delta?.type
          if (dt === 'text_delta' || dt === 'thinking_delta') {
            this.cb.onEvent({
              kind: 'text-delta',
              msgId: this.curMsgId,
              index: e.index ?? this.curIndex,
              text: dt === 'text_delta' ? e.delta.text : e.delta.thinking,
              blockType: dt === 'text_delta' ? 'text' : 'thinking'
            })
          }
        }
        return
      }

      case 'assistant': {
        const msgId: string = m.message?.id ?? randomUUID()
        if (typeof m.message?.model === 'string') this.lastModel = m.message.model
        const blocks = (m.message?.content ?? []).map(toBlock).filter(Boolean) as Block[]
        if (blocks.length === 0) return
        const index = msgId === this.curMsgId ? this.curIndex : undefined
        this.cb.onEvent({ kind: 'assistant', msgId, blocks, index })
        return
      }

      case 'user': {
        const content = m.message?.content
        if (!Array.isArray(content)) return
        for (const c of content) {
          if (c?.type !== 'tool_result') continue
          this.cb.onEvent({
            kind: 'tool-result',
            toolUseId: c.tool_use_id,
            content: stringifyToolResult(c.content),
            isError: !!c.is_error
          })
        }
        return
      }

      case 'result': {
        const isError = !!m.is_error || (m.subtype && m.subtype !== 'success')
        this.endTurn({
          isError,
          errorText: isError ? String(m.result ?? m.subtype ?? 'Fehler') : undefined,
          costTotalUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : undefined,
          durationMs: m.duration_ms
        })
        return
      }
    }
  }

  private endTurn(r: { isError: boolean; errorText?: string; costTotalUsd?: number; durationMs?: number }): void {
    if (!this._busy) return
    this.cb.onEvent({
      kind: 'turn-end',
      id: randomUUID(),
      durationMs: r.durationMs ?? Date.now() - this.turnStartedAt,
      costTotalUsd: r.costTotalUsd,
      isError: r.isError,
      errorText: r.errorText,
      model: this.lastModel
    })
    this.lastModel = undefined
    this.setBusy(false)
    this.armIdle()
  }

  private failTurn(text: string): void {
    this.endTurn({ isError: true, errorText: text })
  }

  private setBusy(b: boolean): void {
    this._busy = b
    this.cb.onBusy(b)
  }

  private armIdle(): void {
    this.clearIdle()
    const ms = Math.max(1, this.ctx.settings().idleTimeoutMinutes) * 60_000
    this.idleTimer = setTimeout(() => {
      if (!this._busy && this.proc) {
        this.proc.removeAllListeners()
        this.proc.kill('SIGTERM')
        this.proc = null
      }
    }, ms)
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

function toBlock(c: any): Block | null {
  switch (c?.type) {
    case 'text':
      return { type: 'text', text: c.text ?? '' }
    case 'thinking':
      return { type: 'thinking', text: c.thinking ?? '' }
    case 'tool_use':
      return { type: 'tool_use', id: c.id, name: c.name, input: c.input }
    default:
      return null
  }
}

function stringifyToolResult(content: unknown): string {
  let s: string
  if (typeof content === 'string') s = content
  else if (Array.isArray(content))
    s = content.map((c: any) => (c?.type === 'text' ? c.text : c?.type === 'image' ? '[Bild]' : JSON.stringify(c))).join('\n')
  else s = JSON.stringify(content ?? '')
  return s.length > MAX_TOOL_RESULT ? s.slice(0, MAX_TOOL_RESULT) + '\n… (gekürzt)' : s
}

export const createClaudeSession: AgentFactory = (ctx, cb) => new ClaudeSession(ctx, cb)
