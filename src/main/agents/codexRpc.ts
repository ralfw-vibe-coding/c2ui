import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

/** Fehler einer JSON-RPC-Anfrage an den app-server. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
}

export interface RpcHandlers {
  /** Benachrichtigung des Servers (ohne id). */
  notification(method: string, params: any): void
  /** Anfrage des Servers an uns (z. B. Freigaben); Antwort ist das Ergebnis oder ein Fehler. */
  request(method: string, params: any): Promise<unknown>
  /** Prozess beendet (oder nicht startbar). */
  exit(info: { code: number | null; signal: string | null; error?: Error; stderr: string }): void
}

/**
 * Verbindung zu `codex app-server`: JSON-RPC, eine Nachricht pro Zeile über stdin/stdout.
 * Der Server läuft als Kindprozess so lange, wie die App ihn braucht.
 */
export class CodexRpc {
  private readonly proc: ChildProcessWithoutNullStreams
  private nextId = 0
  private readonly pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private buf = ''
  private stderrTail = ''
  private closed = false

  constructor(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }, private readonly h: RpcHandlers) {
    this.proc = spawn(cmd, args, { cwd: opts.cwd, env: opts.env })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (d: string) => this.onData(d))
    this.proc.stderr.setEncoding('utf8')
    this.proc.stderr.on('data', (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-4000)
    })
    this.proc.on('error', (err) => this.onClose(null, null, err))
    // 'close' statt 'exit': erst dann sind alle stdout-Daten gelesen.
    this.proc.on('close', (code, signal) => this.onClose(code, signal))
  }

  get alive(): boolean {
    return !this.closed
  }

  request<T = any>(method: string, params: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex app-server läuft nicht'))
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write({ id, method, params })
    })
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params })
  }

  kill(): void {
    if (this.closed) return
    this.proc.kill('SIGTERM')
    const p = this.proc
    setTimeout(() => {
      if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL')
    }, 3000)
  }

  private write(msg: unknown): void {
    if (this.closed) return
    try {
      this.proc.stdin.write(JSON.stringify(msg) + '\n')
    } catch {
      /* Prozess beendet sich gerade; onClose räumt auf */
    }
  }

  private onData(d: string): void {
    this.buf += d
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line.startsWith('{')) continue
      let m: any
      try {
        m = JSON.parse(line)
      } catch {
        continue
      }
      this.dispatch(m)
    }
  }

  private dispatch(m: any): void {
    if (m.id !== undefined && m.method === undefined) {
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      if (m.error) p.reject(new RpcError(m.error.code ?? 0, String(m.error.message ?? 'Fehler')))
      else p.resolve(m.result)
      return
    }
    if (m.id !== undefined) {
      // Anfrage des Servers
      this.h.request(m.method, m.params).then(
        (result) => this.write({ id: m.id, result }),
        (err: Error) => this.write({ id: m.id, error: { code: -32603, message: err.message } })
      )
      return
    }
    if (m.method) this.h.notification(m.method, m.params ?? {})
  }

  private onClose(code: number | null, signal: string | null, error?: Error): void {
    if (this.closed) return
    this.closed = true
    const msg = error?.message ?? 'Codex app-server wurde beendet'
    for (const p of this.pending.values()) p.reject(new Error(msg))
    this.pending.clear()
    this.h.exit({ code, signal, error, stderr: this.stderrTail })
  }
}
