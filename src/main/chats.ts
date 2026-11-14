import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { acceptedMessages, callMessages, isA2uiCall, surfaceIdOf } from '@shared/a2ui'
import type { A2uiSetup } from './agents/a2ui'
import { basename } from 'node:path'
import { applyEvent } from '@shared/transcript'
import {
  chatModel,
  migrateSettings,
  type AgentEvent,
  type AgentKind,
  type Attachment,
  type ChatPatch,
  type Chat,
  type LayoutState,
  type PermissionMode,
  type Settings,
  type Transcript,
  type MergeMark,
  type ChatComment
} from '@shared/types'
import { addComment, cleanComments, removeComment, updateComment } from './comments'
import { createClaudeSession } from './agents/claude'
import { createCodexSession } from './agents/codex'
import type { AgentFactory, AgentSession } from './agents/types'
import type { Storage } from './storage'

const DEFAULT_TITLE = 'Neuer Chat'
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?)$/i

function safeName(name: string): string {
  const n = name.replace(/[\/\\:\x00-\x1f]/g, '_').trim()
  return n || 'anhang'
}

/** Dateiname im Ordner, der noch nicht existiert (name.png, name-2.png, …). */
function uniquePath(dir: string, name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let p = join(dir, name)
  for (let i = 2; existsSync(p); i++) p = join(dir, `${stem}-${i}${ext}`)
  return p
}

/** Wo die App ihr A2UI-Plugin und den MCP-Server findet. */
export interface A2uiPaths {
  pluginDir: string
  serverScript: string
  /** Programm, das den Server ausführt (Electron als Node). */
  execPath: string
  stateDir: string
  /** Verzeichnis für das Schatten-Home von Codex (Skills ohne Eingriff ins echte Home). */
  shadowHomeDir: string
  componentsDir: string
}

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
    private readonly events: ChatManagerEvents,
    private readonly a2ui?: A2uiPaths,
    private readonly attachmentsRoot?: string
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

  create(
    cwd: string,
    agent: AgentKind = 'claude',
    permissionMode?: PermissionMode,
    opts: { title?: string; purpose?: Chat['purpose'] } = {}
  ): Chat {
    const now = Date.now()
    const chat: Chat = {
      id: randomUUID(),
      title: opts.title ?? DEFAULT_TITLE,
      cwd,
      purpose: opts.purpose,
      agent,
      permissionMode: permissionMode ?? this.settings.agents[agent].defaultMode,
      model: this.settings.agents[agent].model,
      sessionId: randomUUID(),
      sessionStarted: false,
      createdAt: now,
      updatedAt: now
    }
    this.chats.set(chat.id, chat)
    if (!opts.purpose) this.setSettings({ lastDirectory: cwd })
    this.saveChats()
    return chat
  }

  /**
   * Chat, der eine bestehende CLI-Session fortsetzt (Claude: `--resume <sessionId>`).
   * Der Verlauf ist dem Agenten bekannt, erscheint hier aber nicht – wie beim Abzweigen.
   */
  adopt(cwd: string, agent: AgentKind, sessionId: string, title?: string): Chat {
    if (agent !== 'claude') throw new Error('Nur Claude-Sessions lassen sich übernehmen')
    const id = sessionId.trim()
    if (!id) throw new Error('Keine Session angegeben')
    for (const c of this.chats.values()) {
      if (c.sessionId === id) throw new Error(`Diese Session läuft schon in „${c.title}“`)
    }
    const chat = this.create(cwd, agent, undefined, { title: title?.trim() || `Übernommen: ${id.slice(0, 8)}` })
    const next: Chat = { ...chat, sessionId: id, sessionStarted: true }
    this.chats.set(next.id, next)
    this.saveChats()
    this.emit(next.id, {
      kind: 'notice',
      id: randomUUID(),
      text: 'Übernommene Session – der bisherige Verlauf ist dem Agenten bekannt, erscheint hier aber nicht. Setze sie nicht gleichzeitig anderswo fort.'
    })
    return next
  }

  /**
   * Neuer Chat, der den Kontext eines bestehenden mitbringt („in neuem Chat fragen“): gleicher Agent,
   * gleiches Verzeichnis, Modus und Modell. Die Quelle bleibt unverändert.
   */
  fork(sourceId: string, title: string, at: { itemId?: string; quote?: string } = {}): Chat {
    const src = this.chats.get(sourceId)
    if (!src) throw new Error('Unbekannter Chat')
    const now = Date.now()
    const chat: Chat = {
      id: randomUUID(),
      title: title.trim() || `Nachfrage: ${src.title}`,
      cwd: src.cwd,
      agent: src.agent,
      permissionMode: src.permissionMode,
      model: chatModel(src, this.settings),
      forkFrom: {
        chatId: src.id,
        title: src.title,
        ...(src.sessionStarted ? { sessionId: src.sessionId } : {}),
        at: {
          turn: this.transcript(src.id).filter((i) => i.type === 'user').length,
          ...(at.itemId ? { itemId: at.itemId } : {}),
          ...(at.quote ? { quote: at.quote.slice(0, 300) } : {})
        }
      },
      sessionId: randomUUID(),
      sessionStarted: false,
      createdAt: now,
      updatedAt: now
    }
    this.chats.set(chat.id, chat)
    this.saveChats()
    this.emit(chat.id, {
      kind: 'notice',
      id: randomUUID(),
      text: `Abgezweigt aus „${src.title}“ – der bisherige Verlauf ist bekannt. Screens von dort erscheinen hier nicht.`
    })
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
    this.commentCache.delete(id)
    this.storage.remove(`comments/${id}`)
    this.saveChats()
  }

  // ---------- Notizen ----------

  comments(chatId: string): ChatComment[] {
    let list = this.commentCache.get(chatId)
    if (!list) {
      list = cleanComments(this.storage.read<unknown>(`comments/${chatId}`, []))
      this.commentCache.set(chatId, list)
    }
    return list
  }

  private setComments(chatId: string, list: ChatComment[]): ChatComment[] {
    this.commentCache.set(chatId, list)
    this.storage.write(`comments/${chatId}`, list)
    return list
  }

  addComment(chatId: string, c: { itemId: string; quote?: string; text: string }): ChatComment[] {
    return this.setComments(chatId, addComment(this.comments(chatId), { ...c, id: randomUUID() }))
  }

  updateComment(chatId: string, id: string, text: string): ChatComment[] {
    return this.setComments(chatId, updateComment(this.comments(chatId), id, text))
  }

  removeComment(chatId: string, id: string): ChatComment[] {
    return this.setComments(chatId, removeComment(this.comments(chatId), id))
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

  send(id: string, text: string, attachments: Attachment[] = [], merge?: MergeMark): void {
    const chat = this.chats.get(id)
    if (!chat) throw new Error('Unbekannter Chat')
    if (this.isBusy(id)) throw new Error('Chat ist beschäftigt')

    if (chat.title === DEFAULT_TITLE) {
      const t = (text || attachments.map((a) => a.name).join(', ')).replace(/\s+/g, ' ').trim()
      chat.title = t.length > 60 ? t.slice(0, 57) + '…' : t || basename(chat.cwd)
    }
    chat.updatedAt = Date.now()
    this.saveChats()

    this.emit(id, { kind: 'user', id: randomUUID(), text, ts: Date.now(), ...(attachments.length ? { attachments } : {}), ...(merge ? { merge } : {}) })
    this.session(chat).send(text, attachments)
  }

  /** Zwischenruf in den laufenden Turn; erscheint im Verlauf, sobald der Agent ihn aufnimmt. */
  steer(id: string, text: string, attachments: Attachment[] = []): void | Promise<void> {
    const s = this.sessions.get(id)
    if (!s?.busy || !s.steer) throw new Error('Zwischenruf ist gerade nicht möglich')
    return s.steer(text, attachments)
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
      {
        chat: () => this.chats.get(chat.id) ?? chat,
        settings: () => this.settings,
        path: this.path,
        a2ui: () => this.a2uiSetup(chat.id),
        history: () => this.historyText(chat.id),
        forkHistory: () => {
          const src = this.chats.get(chat.id)?.forkFrom?.chatId
          return src && this.chats.has(src) ? this.historyText(src, 40_000, false) : ''
        },
        attachmentsDir: () => this.attachmentsDir(chat.id)
      },
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

  /**
   * Verlauf als Text für einen Neustart ohne resume: Nutzer- und Antworttexte sowie angezeigte
   * A2UI-Screens, ohne die gerade gesendete Nachricht. Gekürzt wird vorne (das Neueste bleibt).
   */
  private historyText(chatId: string, maxChars = 40_000, withoutCurrent = true): string {
    const t = [...this.transcript(chatId)]
    if (withoutCurrent) {
      while (t.length && t[t.length - 1].type !== 'user') t.pop()
      t.pop() // aktuelle Nachricht
    }
    const lines: string[] = []
    const screens = new Set<string>()
    for (const item of t) {
      if (item.type === 'user') lines.push(`Nutzer: ${item.text}`)
      else if (item.type === 'assistant') {
        for (const b of item.blocks) {
          if (b.type === 'text' && b.text.trim()) lines.push(`Assistent: ${b.text}`)
          else if (b.type === 'image') lines.push(`[Bild erzeugt: ${b.path}]`)
          else if (b.type === 'tool_use' && isA2uiCall(b) && b.result && !b.result.isError) {
            const ids = callMessages(b.input).map(surfaceIdOf).filter(Boolean) as string[]
            ids.forEach((id) => screens.add(id))
            lines.push(`[A2UI-Screen angezeigt/aktualisiert: ${[...new Set(ids)].join(', ')}]`)
          }
        }
      }
    }
    if (screens.size) {
      lines.push(`Bestehende A2UI-Screens (weiter per updateComponents/updateDataModel änderbar): ${[...screens].join(', ')}`)
    }
    let text = lines.join('\n\n')
    if (text.length > maxChars) text = '…(ältere Teile gekürzt)…\n\n' + text.slice(text.length - maxChars)
    return text
  }

  /** Anhang-Ordner eines Chats (wird bei Bedarf angelegt). */
  attachmentsDir(chatId: string): string | undefined {
    if (!this.attachmentsRoot) return undefined
    const dir = join(this.attachmentsRoot, chatId)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /** Speichert einen Anhang (Bytes, z. B. ein eingefügtes Bild) im Anhang-Ordner des Chats. */
  saveAttachment(chatId: string, name: string, data: Uint8Array): Attachment {
    const dir = this.attachmentsDir(chatId)
    if (!dir) throw new Error('Kein Anhang-Ordner')
    const path = uniquePath(dir, safeName(name))
    writeFileSync(path, data)
    return { path, name: basename(path), image: IMAGE_FILE.test(path) }
  }

  /** Kopiert eine Datei (z. B. per Drag&Drop) in den Anhang-Ordner des Chats. */
  importAttachment(chatId: string, src: string): Attachment {
    const dir = this.attachmentsDir(chatId)
    if (!dir) throw new Error('Kein Anhang-Ordner')
    if (!statSync(src).isFile()) throw new Error(`„${basename(src)}“ ist keine Datei (Ordner werden nicht unterstützt).`)
    const path = uniquePath(dir, safeName(basename(src)))
    copyFileSync(src, path)
    return { path, name: basename(src), image: IMAGE_FILE.test(path) }
  }

  /** A2UI-Einrichtung für einen Prozessstart; legt vorher den bisherigen A2UI-Stand des Chats ab. */
  private a2uiSetup(chatId: string): A2uiSetup | null {
    if (!this.a2ui) return null
    const { pluginDir, serverScript, execPath, stateDir, shadowHomeDir, componentsDir } = this.a2ui
    mkdirSync(stateDir, { recursive: true })
    const stateFile = join(stateDir, `${chatId}.json`)
    writeFileSync(stateFile, JSON.stringify(acceptedMessages(this.transcript(chatId))))
    return { pluginDir, skillDir: join(pluginDir, 'skills', 'a2ui'), serverScript, execPath, stateFile, shadowHomeDir, componentsDir }
  }

  /** Notizen je Chat (Ablage: `comments/<chatId>`). */
  private commentCache = new Map<string, ChatComment[]>()

  private emit(id: string, e: AgentEvent): void {
    const chat = this.chats.get(id)
    if (e.kind === 'session' && chat) {
      if (!chat.sessionStarted || chat.sessionId !== e.sessionId) {
        this.chats.set(id, { ...chat, sessionStarted: true, sessionId: e.sessionId })
        this.saveChats()
      }
      return
    }
    if (e.kind === 'context') {
      if (chat) {
        this.chats.set(id, { ...chat, context: { used: e.used, ...(e.max ? { max: e.max } : {}), at: Date.now() } })
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
