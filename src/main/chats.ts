import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { applyEvent } from '@shared/transcript'
import {
  chatModel,
  migrateSettings,
  type AgentEvent,
  type AgentKind,
  type ChatPatch,
  type Chat,
  type LayoutState,
  type PermissionMode,
  type Settings,
  type Transcript
} from '@shared/types'
import { createClaudeSession } from './agents/claude'
import { createCodexSession } from './agents/codex'
import type { AgentFactory, AgentSession } from './agents/types'
import type { Storage } from './storage'

const DEFAULT_TITLE = 'Neuer Chat'

export interface ChatManagerEvents {
  agentEvent(chatId: string, e: AgentEvent): void
  busy(chatId: string, busy: boolean): void
  chatsChanged(chats: Chat[]): void
}

const factories: Record<AgentKind, AgentFactory> = {
  claude: createClaudeSession,
  codex: createCodexSession
}

/** Verwaltet Chats, ihre Transkripte und die zugehörigen CLI-Sitzungen. */
export class ChatManager {
  private chats = new Map<string, Chat>()
  private transcripts = new Map<string, Transcript>()
  private sessions = new Map<string, AgentSession>()
  /** Chats, deren CLI-Prozess nach dem laufenden Turn neu starten muss (Modus/Modell geändert). */
  private restartAfterTurn = new Set<string>()
  private settings: Settings

  constructor(
    private readonly storage: Storage,
    private readonly path: string,
    private readonly events: ChatManagerEvents
  ) {
    this.settings = migrateSettings(storage.read<unknown>('settings', {}))
    for (const c of storage.read<Chat[]>('chats', [])) this.chats.set(c.id, c)
  }

  // ---------- Settings & Layout ----------

  getSettings(): Settings {
    return this.settings
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.settings = migrateSettings({ ...this.settings, ...patch })
    this.storage.write('settings', this.settings)
    return this.settings
  }

  getLayout(): LayoutState | null {
    return this.storage.read<LayoutState | null>('layout', null)
  }

  setLayout(l: LayoutState): void {
    this.storage.write('layout', l, 500)
  }

  // ---------- Chats ----------

  list(): Chat[] {
    return [...this.chats.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  create(cwd: string, agent: AgentKind = 'claude', permissionMode?: PermissionMode): Chat {
    const now = Date.now()
    const chat: Chat = {
      id: randomUUID(),
      title: DEFAULT_TITLE,
      cwd,
      agent,
      permissionMode: permissionMode ?? this.settings.agents[agent].defaultMode,
      model: this.settings.agents[agent].model,
      sessionId: randomUUID(),
      sessionStarted: false,
      createdAt: now,
      updatedAt: now
    }
    this.chats.set(chat.id, chat)
    this.setSettings({ lastDirectory: cwd })
    this.saveChats()
    return chat
  }

  update(id: string, patch: ChatPatch): Chat | undefined {
    const chat = this.chats.get(id)
    if (!chat) return undefined
    const next = { ...chat, ...patch }
    this.chats.set(id, next)
    // Modus und Modell gelten ab dem nächsten Prozessstart. Die Session (Verlauf) bleibt,
    // der neue Prozess setzt sie fort. Läuft gerade ein Turn, wird danach neu gestartet.
    const changed =
      (patch.permissionMode !== undefined && patch.permissionMode !== chat.permissionMode) ||
      (patch.model !== undefined && patch.model !== chatModel(chat, this.settings))
    if (changed) this.restartSession(id)
    this.saveChats()
    return next
  }

  private restartSession(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    if (s.busy) {
      this.restartAfterTurn.add(id)
      return
    }
    s.dispose()
    this.sessions.delete(id)
  }

  delete(id: string): void {
    this.sessions.get(id)?.dispose()
    this.sessions.delete(id)
    this.chats.delete(id)
    this.transcripts.delete(id)
    this.storage.remove(`transcripts/${id}`)
    this.saveChats()
  }

  transcript(id: string): Transcript {
    let t = this.transcripts.get(id)
    if (!t) {
      t = this.storage.read<Transcript>(`transcripts/${id}`, [])
      this.transcripts.set(id, t)
    }
    return t
  }

  // ---------- Agent ----------

  isBusy(id: string): boolean {
    return this.sessions.get(id)?.busy ?? false
  }

  busyIds(): string[] {
    return [...this.sessions.entries()].filter(([, s]) => s.busy).map(([id]) => id)
  }

  send(id: string, text: string): void {
    const chat = this.chats.get(id)
    if (!chat) throw new Error('Unbekannter Chat')
    if (this.isBusy(id)) throw new Error('Chat ist beschäftigt')

    if (chat.title === DEFAULT_TITLE) {
      const t = text.replace(/\s+/g, ' ').trim()
      chat.title = t.length > 60 ? t.slice(0, 57) + '…' : t || basename(chat.cwd)
    }
    chat.updatedAt = Date.now()
    this.saveChats()

    this.emit(id, { kind: 'user', id: randomUUID(), text, ts: Date.now() })
    this.session(chat).send(text)
  }

  interrupt(id: string): void {
    this.sessions.get(id)?.interrupt()
  }

  disposeAll(): void {
    for (const s of this.sessions.values()) s.dispose()
    this.sessions.clear()
    this.storage.flush()
  }

  private session(chat: Chat): AgentSession {
    let s = this.sessions.get(chat.id)
    if (s) return s
    const factory = factories[chat.agent]
    if (!factory) throw new Error(`Unbekannter Agent „${chat.agent}“`)
    s = factory(
      { chat: () => this.chats.get(chat.id) ?? chat, settings: () => this.settings, path: this.path },
      {
        onEvent: (e) => this.emit(chat.id, e),
        onBusy: (b) => {
          this.events.busy(chat.id, b)
          if (!b && this.restartAfterTurn.delete(chat.id)) this.restartSession(chat.id)
        }
      }
    )
    this.sessions.set(chat.id, s)
    return s
  }

  private emit(id: string, e: AgentEvent): void {
    const chat = this.chats.get(id)
    if (e.kind === 'session' && chat) {
      if (!chat.sessionStarted || chat.sessionId !== e.sessionId) {
        this.chats.set(id, { ...chat, sessionStarted: true, sessionId: e.sessionId })
        this.saveChats()
      }
      return
    }
    const t = applyEvent(this.transcript(id), e)
    this.transcripts.set(id, t)
    // Während des Streamings selten, am Turn-Ende sofort speichern.
    this.storage.write(`transcripts/${id}`, t, e.kind === 'turn-end' ? 0 : 2000)
    if (e.kind === 'turn-end' && chat) {
      this.chats.set(id, { ...this.chats.get(id)!, updatedAt: Date.now() })
      this.saveChats()
    }
    this.events.agentEvent(id, e)
  }

  private saveChats(): void {
    const list = this.list()
    this.storage.write('chats', list)
    this.events.chatsChanged(list)
  }
}
