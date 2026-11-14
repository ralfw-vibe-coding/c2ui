import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { A2UI_SERVER } from '@shared/a2ui'
import { chatModel, type Attachment, type Block } from '@shared/types'
import { childEnv } from '../env'
import { codexA2uiLaunch } from './a2ui'
import { inlineImages, textWithAttachments } from './attachments'
import { resolveCodexBinary } from './codexBinary'
import { CodexRpc } from './codexRpc'
import type { AgentCallbacks, AgentContext, AgentFactory, AgentSession } from './types'

const MAX_TOOL_RESULT = 20_000

/**
 * Codex-Adapter über `codex app-server` (JSON-RPC, wie die Codex-App selbst).
 * Pro Chat ein Server-Prozess, der mehrere Turns bedient; nach Leerlauf wird er beendet und beim
 * nächsten Turn neu gestartet (Thread per `thread/resume`). Bringt Streaming, Zwischenrufe
 * (`turn/steer`), echtes Abzweigen (`thread/fork`) und sauberes Abbrechen (`turn/interrupt`).
 */
class CodexSession implements AgentSession {
  private rpc: CodexRpc | null = null
  private starting: Promise<CodexRpc> | null = null
  /** Im laufenden Server geladener Thread. */
  private threadId: string | null = null
  private turnId: string | null = null
  private turnIdWaiters: { resolve: (id: string) => void; reject: (e: Error) => void }[] = []
  private _busy = false
  private interrupted = false
  private turnStartedAt = 0
  private turnModel: string | undefined
  /** Blöcke eines Turns landen in einer Assistant-Nachricht – bis ein Zwischenruf sie teilt. */
  private msgId = ''
  private nextIndex = 0
  /** Item-ID → Nachricht und Position des zugehörigen Blocks. */
  private blockOf = new Map<string, { msgId: string; index: number }>()
  /** Zwischenrufe, die an Codex gingen, aber noch nicht im Verlauf aufgetaucht sind. */
  private steers = new Map<string, { text: string; attachments: Attachment[] }>()
  private sawImage = false
  private idleTimer: NodeJS.Timeout | null = null
  private interruptTimer: NodeJS.Timeout | null = null

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
    this.turnId = null
    this.newMessage()
    this.blockOf.clear()
    this.sawImage = false
    this.startTurn(text, attachments).catch((err) => this.endTurn(true, errorText(err)))
  }

  async steer(text: string, attachments: Attachment[] = []): Promise<void> {
    if (!this._busy || this.interrupted || !this.rpc) throw new Error('Zwischenruf nur während einer laufenden Antwort möglich')
    // Kommt der Zwischenruf, bevor der Turn läuft (Server/Thread starten noch), auf den Turn warten.
    const turnId = this.turnId ?? (await new Promise<string>((resolve, reject) => this.turnIdWaiters.push({ resolve, reject })))
    const rpc = this.rpc
    const threadId = this.threadId
    if (!rpc || !threadId || !this._busy) throw new Error('Zwischenruf nur während einer laufenden Antwort möglich')
    const id = randomUUID()
    this.steers.set(id, { text, attachments })
    try {
      await rpc.request('turn/steer', { threadId, expectedTurnId: turnId, clientUserMessageId: id, input: userInput(text, attachments) })
    } catch (err) {
      this.steers.delete(id)
      throw new Error(`Zwischenruf nicht möglich: ${errorText(err)}`)
    }
  }

  interrupt(): void {
    if (!this._busy || this.interrupted) return
    this.interrupted = true
    const rpc = this.rpc
    if (rpc && this.threadId && this.turnId) {
      rpc.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId }).catch(() => {})
    }
    // Falls Codex nicht reagiert: Server beenden, der Turn endet dann als abgebrochen.
    this.interruptTimer = setTimeout(() => {
      if (this._busy) this.rpc?.kill()
    }, 5000)
  }

  dispose(): void {
    this.clearIdle()
    this.stopServer()
    if (this._busy) this.setBusy(false)
  }

  // ---------------------------------------------------------------------------

  private async startTurn(text: string, attachments: Attachment[]): Promise<void> {
    const rpc = await this.server()
    const { threadId, prefix } = await this.thread(rpc)
    if (this.interrupted) return this.endTurn(true, 'Abgebrochen.')
    const r = await rpc.request('turn/start', {
      threadId,
      clientUserMessageId: randomUUID(),
      input: userInput(prefix ? prefix + text : text, attachments)
    })
    this.setTurnId(r?.turn?.id)
    if (this.interrupted && this.turnId) rpc.request('turn/interrupt', { threadId, turnId: this.turnId }).catch(() => {})
  }

  /** Laufenden Server liefern oder einen starten (inkl. initialize). */
  private server(): Promise<CodexRpc> {
    if (this.rpc?.alive) return Promise.resolve(this.rpc)
    if (this.starting) return this.starting
    this.starting = (async () => {
      const cfg = this.ctx.settings().agents.codex
      const bin = resolveCodexBinary(cfg.path, this.ctx.path)
      // A2UI: Skill über Schatten-Home, MCP-Server per -c.
      const a2ui = this.ctx.a2ui?.()
      const launch = a2ui ? codexA2uiLaunch(a2ui) : { args: [], env: {} }
      const chat = this.ctx.chat()
      const rpc: CodexRpc = new CodexRpc(
        bin.path,
        ['app-server', ...launch.args],
        { cwd: chat.cwd, env: { ...childEnv(this.ctx.path), ...launch.env } },
        {
          notification: (m, p) => {
            if (this.rpc === rpc) this.onNotification(m, p)
          },
          request: async (m) => {
            throw new Error(`C2UI beantwortet „${m}“ nicht`)
          },
          exit: (info) => this.onExit(rpc, info)
        }
      )
      this.rpc = rpc
      this.threadId = null
      await rpc.request('initialize', {
        clientInfo: { name: 'c2ui', title: 'C2UI', version: '1' },
        capabilities: { experimentalApi: false, requestAttestation: false }
      })
      rpc.notify('initialized')
      return rpc
    })()
    try {
      return this.starting
    } finally {
      this.starting.catch(() => {}).finally(() => (this.starting = null))
    }
  }

  /**
   * Thread im Server bereitstellen: fortsetzen, abzweigen oder neu anlegen. Geht das Fortsetzen
   * nicht, startet ein neuer Thread; dann liefert `prefix` den bisherigen Verlauf als Kontext.
   */
  private async thread(rpc: CodexRpc): Promise<{ threadId: string; prefix: string }> {
    if (this.threadId) return { threadId: this.threadId, prefix: '' }
    const chat = this.ctx.chat()
    const model = chatModel(chat, this.ctx.settings())
    const common = { cwd: chat.cwd, sandbox: chat.permissionMode, approvalPolicy: 'never', ...(model ? { model } : {}) }
    let prefix = ''
    let r: any
    try {
      if (chat.sessionStarted) r = await rpc.request('thread/resume', { threadId: chat.sessionId, ...common })
      else if (chat.forkFrom?.sessionId) r = await rpc.request('thread/fork', { threadId: chat.forkFrom.sessionId, excludeTurns: true, ...common })
    } catch (err) {
      const forking = !chat.sessionStarted
      this.notice(
        forking
          ? `Codex konnte den Ursprungs-Chat nicht abzweigen (${errorText(err)}). Der Verlauf geht als Text mit.`
          : `Codex kann diese Session nicht fortsetzen (${errorText(err)}). Der Chat geht in einer neuen Codex-Session weiter, die den bisherigen Verlauf als Kontext bekommt.`
      )
      const history = (forking ? this.ctx.forkHistory?.() : this.ctx.history?.()) ?? ''
      if (history) {
        prefix = forking
          ? `Dieses Gespräch zweigt von einem früheren Chat („${chat.forkFrom?.title}“) ab.\n` +
            `Dessen Verlauf (vom Client mitgeschrieben, ggf. gekürzt):\n<verlauf>\n${history}\n</verlauf>\n\nNeue Nachricht des Nutzers:\n`
          : `Dies ist die Fortsetzung eines früheren Gesprächs, dessen Codex-Session nicht fortgesetzt werden konnte.\n` +
            `Bisheriger Verlauf (vom Client mitgeschrieben, ggf. gekürzt):\n<verlauf>\n${history}\n</verlauf>\n\nAktuelle Nachricht des Nutzers:\n`
      }
      r = undefined
    }
    if (!r) r = await rpc.request('thread/start', common)
    const id: string = r.thread.id
    this.threadId = id
    this.turnModel = r.model || model || undefined
    if (!chat.sessionStarted || chat.sessionId !== id) this.cb.onEvent({ kind: 'session', sessionId: id })
    return { threadId: id, prefix }
  }

  private onNotification(method: string, p: any): void {
    if (p?.threadId && this.threadId && p.threadId !== this.threadId) return
    switch (method) {
      case 'turn/started':
        this.setTurnId(p.turn?.id)
        return
      case 'item/started':
        this.onItem(p.item, false)
        return
      case 'item/completed':
        this.onItem(p.item, true)
        return
      case 'item/agentMessage/delta': {
        if (!this._busy) return
        const b = this.block(p.itemId)
        this.cb.onEvent({ kind: 'text-delta', msgId: b.msgId, index: b.index, text: String(p.delta ?? ''), blockType: 'text' })
        return
      }
      case 'thread/tokenUsage/updated': {
        const { used, max } = codexContext(p)
        if (used) this.cb.onEvent({ kind: 'context', used, ...(max ? { max } : {}) })
        return
      }
      case 'mcpServer/startupStatus/updated':
        if (p.name === A2UI_SERVER && p.status === 'failed') this.notice(`A2UI-Server für Codex nicht gestartet: ${p.error ?? ''}`)
        return
      case 'turn/completed': {
        if (p.turn?.id && this.turnId && p.turn.id !== this.turnId) return
        const status = p.turn?.status
        if (status === 'completed') this.endTurn(false)
        else if (status === 'interrupted') this.endTurn(true, 'Abgebrochen.')
        else this.endTurn(true, p.turn?.error?.message ?? 'Turn fehlgeschlagen')
        return
      }
    }
  }

  private onItem(item: any, completed: boolean): void {
    if (!item?.type || !this._busy) return
    switch (item.type) {
      case 'userMessage': {
        // Ein Zwischenruf ist aufgenommen: im Verlauf an dieser Stelle zeigen; was danach kommt,
        // beginnt eine neue Assistant-Nachricht unter ihm.
        const s = item.clientId ? this.steers.get(item.clientId) : undefined
        if (!s || completed) return
        this.steers.delete(item.clientId)
        this.cb.onEvent({ kind: 'user', id: randomUUID(), text: s.text, ts: Date.now(), steer: true, ...(s.attachments.length ? { attachments: s.attachments } : {}) })
        this.newMessage()
        return
      }
      case 'agentMessage': {
        const b = this.block(item.id)
        if (completed && item.text) this.cb.onEvent({ kind: 'assistant', msgId: b.msgId, index: b.index, blocks: [{ type: 'text', text: item.text }] })
        return
      }
      case 'reasoning': {
        const text = [...(item.summary ?? []), ...(item.content ?? [])].join('\n').trim()
        if (completed && text) this.addBlock(item.id, { type: 'thinking', text })
        return
      }
      case 'imageGeneration':
        if (completed && item.savedPath) {
          this.sawImage = true
          this.addBlock(item.id, { type: 'image', path: item.savedPath })
        }
        return
      case 'contextCompaction':
        if (completed) this.notice('Codex hat den bisherigen Verlauf verdichtet, um Platz im Kontext zu schaffen.')
        return
      default: {
        const tool = toolOf(item)
        if (!tool) return
        const id = `codex-${item.id}`
        if (!this.blockOf.has(item.id)) this.addBlock(item.id, { type: 'tool_use', id, name: tool.name, input: tool.input })
        if (completed) this.cb.onEvent({ kind: 'tool-result', toolUseId: id, content: truncate(tool.result), isError: tool.isError })
      }
    }
  }

  /** Position des Blocks zu einem Item (beim ersten Auftauchen vergeben). */
  private block(itemId: string): { msgId: string; index: number } {
    let b = this.blockOf.get(itemId)
    if (!b) {
      b = { msgId: this.msgId, index: this.nextIndex++ }
      this.blockOf.set(itemId, b)
    }
    return b
  }

  private addBlock(itemId: string, block: Block): void {
    const b = this.block(itemId)
    this.cb.onEvent({ kind: 'assistant', msgId: b.msgId, index: b.index, blocks: [block] })
  }

  private newMessage(): void {
    this.msgId = 'codex-' + randomUUID()
    this.nextIndex = 0
  }

  private setTurnId(id: string | undefined): void {
    if (!id || this.turnId === id) return
    this.turnId = id
    for (const w of this.turnIdWaiters.splice(0)) w.resolve(id)
  }

  private onExit(rpc: CodexRpc, info: { code: number | null; signal: string | null; error?: Error; stderr: string }): void {
    if (this.rpc !== rpc) return
    this.rpc = null
    this.threadId = null
    if (!this._busy) return
    if (this.interrupted) return this.endTurn(true, 'Abgebrochen.')
    const cmd = resolveCodexBinary(this.ctx.settings().agents.codex.path, this.ctx.path).path
    const detail =
      (info.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
        ? `Codex CLI nicht gefunden („${cmd}“). Pfad in den Einstellungen prüfen.`
        : `Codex app-server wurde beendet: ${lastErrorLines(info.stderr) || `Exit-Code ${info.code ?? info.signal}`}`
    this.endTurn(true, detail)
  }

  /**
   * Fallback für Bilder, die nicht als `imageGeneration`-Item gemeldet wurden: Codex legt sie unter
   * $CODEX_HOME/generated_images/<thread>/ ab.
   */
  private emitGeneratedImages(): void {
    if (this.sawImage || !this.threadId) return
    const dir = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', this.threadId)
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
    for (const path of files) this.addBlock(`img-${path}`, { type: 'image', path })
  }

  private notice(text: string): void {
    this.cb.onEvent({ kind: 'notice', id: randomUUID(), text })
  }

  private endTurn(isError: boolean, errorText?: string): void {
    if (!this._busy) return
    if (this.interruptTimer) clearTimeout(this.interruptTimer)
    this.interruptTimer = null
    if (!isError) this.emitGeneratedImages()
    // Nicht mehr aufgenommene Zwischenrufe melden statt still zu verlieren.
    for (const s of this.steers.values()) this.notice(`Zwischenruf nicht mehr angekommen: „${s.text}“`)
    this.steers.clear()
    this.cb.onEvent({
      kind: 'turn-end',
      id: randomUUID(),
      durationMs: Date.now() - this.turnStartedAt,
      isError,
      errorText,
      model: this.turnModel
    })
    this.turnId = null
    for (const w of this.turnIdWaiters.splice(0)) w.reject(new Error('Die Antwort ist schon zu Ende'))
    this.setBusy(false)
    this.armIdle()
  }

  private setBusy(b: boolean): void {
    this._busy = b
    this.cb.onBusy(b)
  }

  private stopServer(): void {
    const rpc = this.rpc
    this.rpc = null
    this.threadId = null
    rpc?.kill()
  }

  private armIdle(): void {
    this.clearIdle()
    const ms = Math.max(1, this.ctx.settings().idleTimeoutMinutes) * 60_000
    this.idleTimer = setTimeout(() => {
      if (!this._busy) this.stopServer()
    }, ms)
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

/** Eingabe für turn/start bzw. turn/steer: Text plus Bilder als lokale Dateien. */
function userInput(text: string, attachments: Attachment[]): unknown[] {
  return [
    { type: 'text', text: textWithAttachments(text, attachments), text_elements: [] },
    ...inlineImages(attachments).map((i) => ({ type: 'localImage', path: i.path }))
  ]
}

/** Übersetzt Codex-Items, die Werkzeugen entsprechen, in einen Tool-Block. */
export function toolOf(item: any): { name: string; input: unknown; result: string; isError: boolean } | null {
  switch (item.type) {
    case 'commandExecution':
      return {
        name: 'Shell',
        input: { command: unwrapShell(item.command) },
        result: item.aggregatedOutput ?? '',
        isError: item.status === 'failed' || item.status === 'declined' || (typeof item.exitCode === 'number' && item.exitCode !== 0)
      }
    case 'fileChange':
      return {
        name: 'Dateien',
        input: {
          description: (item.changes ?? []).map((c: any) => `${changeKind(c.kind)} ${c.path ?? ''}`.trim()).join(', '),
          changes: item.changes
        },
        result: item.status ?? '',
        isError: item.status === 'failed' || item.status === 'declined'
      }
    case 'mcpToolCall':
      // Benennung wie bei Claude (mcp__server__tool), damit z. B. A2UI-Aufrufe gleich erkannt werden.
      return {
        name: `mcp__${item.server ?? 'mcp'}__${item.tool ?? ''}`,
        input: item.arguments ?? {},
        result: item.error?.message ?? mcpResultText(item.result),
        isError: item.status === 'failed' || !!item.error || !!item.result?.isError || !!item.result?.is_error
      }
    case 'dynamicToolCall':
      return {
        name: item.tool ?? 'Werkzeug',
        input: item.arguments ?? {},
        result: (item.contentItems ?? []).map((c: any) => (c?.type === 'inputText' || c?.text ? c.text : JSON.stringify(c))).join('\n'),
        isError: item.success === false || item.status === 'failed'
      }
    case 'webSearch':
      return { name: 'WebSearch', input: { query: item.query }, result: '', isError: false }
    case 'plan':
      return { name: 'Plan', input: { description: 'Plan' }, result: item.text ?? '', isError: false }
    case 'collabAgentToolCall':
      return { name: 'Agent', input: { description: item.prompt ?? item.tool ?? '' }, result: '', isError: item.status === 'failed' }
    default:
      return null
  }
}

function changeKind(k: any): string {
  const t = typeof k === 'string' ? k : k?.type
  return ({ add: 'neu', delete: 'gelöscht', update: 'geändert' } as Record<string, string>)[t] ?? (t ?? '')
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

function errorText(err: unknown): string {
  return String((err as Error)?.message ?? err)
}

function lastErrorLines(stderr: string): string {
  return stderr
    .split('\n')
    .filter((l) => l.trim() && !/rmcp::transport|WARN|INFO/.test(l))
    .slice(-3)
    .join('\n')
}

export const createCodexSession: AgentFactory = (ctx, cb) => new CodexSession(ctx, cb)

const num = (x: unknown): number | undefined => (typeof x === 'number' && x > 0 ? x : undefined)

/**
 * Kontextfüllstand aus `thread/tokenUsage/updated`:
 * `tokenUsage.last` ist die letzte Anfrage (das, was im Fenster steht), `total` die Summe des Threads.
 * Beispiel: `{ tokenUsage: { last: { totalTokens, inputTokens, outputTokens … }, modelContextWindow } }`.
 */
export function codexContext(p: any): { used?: number; max?: number } {
  const tu = p?.tokenUsage ?? p?.usage ?? p
  const u = tu?.last ?? tu?.lastTokenUsage ?? tu
  const max = num(tu?.modelContextWindow) ?? num(p?.modelContextWindow)
  if (!u || typeof u !== 'object') return { max }
  const n = (x: unknown): number => num(x) ?? 0
  const used =
    num(u.totalTokens) ??
    num(u.total_tokens) ??
    (n(u.inputTokens ?? u.input_tokens) + n(u.outputTokens ?? u.output_tokens) + n(u.reasoningOutputTokens ?? u.reasoning_output_tokens) || undefined)
  return { used, max }
}
