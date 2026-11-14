// Datentypen, die Main-Prozess und Renderer gemeinsam nutzen.

export type AgentKind = 'claude' | 'codex'

/** Berechtigungs- bzw. Sandbox-Modus; gültige Werte hängen vom Agenten ab (siehe AGENTS). */
export type PermissionMode = string

export interface AgentInfo {
  label: string
  modes: { value: string; label: string }[]
  defaultMode: string
}

export const AGENTS: Record<AgentKind, AgentInfo> = {
  claude: {
    label: 'Claude',
    defaultMode: 'acceptEdits',
    modes: [
      { value: 'acceptEdits', label: 'Edits erlauben' },
      { value: 'auto', label: 'Auto' },
      { value: 'manual', label: 'Manuell (Rückfragen werden abgelehnt)' },
      { value: 'dontAsk', label: 'Nicht fragen' },
      { value: 'plan', label: 'Nur planen' },
      { value: 'bypassPermissions', label: 'Alles erlauben (gefährlich)' }
    ]
  },
  codex: {
    label: 'Codex',
    defaultMode: 'workspace-write',
    modes: [
      { value: 'read-only', label: 'Nur lesen' },
      { value: 'workspace-write', label: 'Im Arbeitsverzeichnis schreiben' },
      { value: 'danger-full-access', label: 'Voller Zugriff (gefährlich)' }
    ]
  }
}

export const AGENT_KINDS = Object.keys(AGENTS) as AgentKind[]

export function modeLabel(agent: AgentKind, mode: string): string {
  return AGENTS[agent].modes.find((m) => m.value === mode)?.label ?? mode
}

/** Anhang einer Nutzernachricht (liegt als Datei im Anhang-Ordner des Chats). */
export interface Attachment {
  path: string
  name: string
  image: boolean
}

export interface Chat {
  id: string
  title: string
  cwd: string
  agent: AgentKind
  permissionMode: PermissionMode
  /** Modell dieses Chats; leer = Standard der CLI. Fehlt bei alten Chats (dann Einstellung). */
  model?: string
  /** Sonderzweck: 'component-workshop' = Chat zum Bauen/Bearbeiten eigener A2UI-Komponenten. */
  purpose?: 'component-workshop'
  /**
   * Abgezweigt aus einem anderen Chat („in neuem Chat fragen“): Der erste Turn bringt dessen Verlauf mit.
   * Claude setzt dafür die Session fort (`--resume <sessionId> --fork-session`), Codex per `thread/fork`.
   */
  forkFrom?: { chatId: string; title: string; sessionId?: string; at?: ForkPoint }
  /** Session-ID der CLI (Claude: vorab vergeben; Codex: Thread-ID nach dem ersten Turn). */
  sessionId: string
  /** true, sobald die CLI-Session existiert (dann wird fortgesetzt statt neu begonnen). */
  sessionStarted: boolean
  /** Zuletzt gemeldeter Kontextfüllstand. */
  context?: ContextUse
  createdAt: number
  updatedAt: number
}

/** Auswahlliste für das Modell-Dropdown. */
export interface ModelList {
  options: { value: string; label: string }[]
  /** Modell, das die CLI ohne Angabe nutzt (aus deren Konfiguration), falls bekannt. */
  cliDefault?: string
  error?: string
}

/** Felder eines Chats, die die Oberfläche ändern darf. */
export type ChatPatch = Partial<Pick<Chat, 'title' | 'permissionMode' | 'model'>>

/** Wirksames Modell eines Chats (alte Chats ohne eigenes Modell nutzen die Einstellung). */
export function chatModel(chat: Chat, settings: Settings): string {
  return chat.model ?? settings.agents[chat.agent].model
}

export interface AgentSettings {
  /** Optionaler absoluter Pfad zur Binary; leer = über PATH suchen. */
  path: string
  /** Modell für neue Prozesse; leer = Standard der CLI. */
  model: string
  /** Standardmodus für neue Chats. */
  defaultMode: PermissionMode
}

export interface Settings {
  agents: Record<AgentKind, AgentSettings>
  /** Nach so vielen Minuten Leerlauf wird ein dauerhafter CLI-Prozess (Claude) beendet. */
  idleTimeoutMinutes: number
  lastDirectory: string
  /** Arbeitsschritte (Werkzeuge, Zwischentexte) je Turn einklappen. */
  collapseSteps: boolean
  /** Zusammenführen: Standard-Prompts und ob die Aufarbeitung vor der Übernahme gezeigt wird. */
  merge: MergeSettings
}

export interface MergeSettings {
  /** Prompt an den Nebenchat B: Ergebnisse aufarbeiten. Platzhalter {Titel} (B) und {Ziel} (A). */
  prepare: string
  /** Prompt an den Zielchat A: Aufarbeitung übernehmen. Platzhalter wie oben. */
  adopt: string
  /** Aufarbeitung vor der Übernahme zum Bearbeiten zeigen. */
  preview: boolean
}

export const DEFAULT_MERGE: MergeSettings = {
  prepare:
    'Fasse für den Chat „{Ziel}“ zusammen, was in diesem Nebengespräch geklärt wurde: Ergebnisse, Entscheidungen, offene Punkte. Wiederhole nicht den Verlauf, der dort schon bekannt ist. Antworte nur mit der Zusammenfassung.',
  adopt: 'Berücksichtige diese Ergebnisse aus dem Nebengespräch „{Titel}“.',
  preview: true
}

export const DEFAULT_SETTINGS: Settings = {
  agents: {
    claude: { path: '', model: '', defaultMode: AGENTS.claude.defaultMode },
    codex: { path: '', model: '', defaultMode: AGENTS.codex.defaultMode }
  },
  idleTimeoutMinutes: 10,
  lastDirectory: '',
  collapseSteps: true,
  merge: DEFAULT_MERGE
}

/** Lädt gespeicherte Einstellungen, auch im alten Format (vor Codex). */
export function migrateSettings(raw: any): Settings {
  const s: Settings = structuredClone(DEFAULT_SETTINGS)
  if (!raw || typeof raw !== 'object') return s
  if (typeof raw.idleTimeoutMinutes === 'number') s.idleTimeoutMinutes = raw.idleTimeoutMinutes
  if (typeof raw.lastDirectory === 'string') s.lastDirectory = raw.lastDirectory
  if (typeof raw.collapseSteps === 'boolean') s.collapseSteps = raw.collapseSteps
  if (raw.merge && typeof raw.merge === 'object') {
    if (typeof raw.merge.prepare === 'string' && raw.merge.prepare.trim()) s.merge.prepare = raw.merge.prepare
    if (typeof raw.merge.adopt === 'string' && raw.merge.adopt.trim()) s.merge.adopt = raw.merge.adopt
    if (typeof raw.merge.preview === 'boolean') s.merge.preview = raw.merge.preview
  }
  // Altes Format: Felder direkt auf oberster Ebene, nur Claude
  if (typeof raw.claudePath === 'string') s.agents.claude.path = raw.claudePath
  if (typeof raw.model === 'string') s.agents.claude.model = raw.model
  if (typeof raw.defaultPermissionMode === 'string') s.agents.claude.defaultMode = raw.defaultPermissionMode
  for (const k of AGENT_KINDS) {
    const a = raw.agents?.[k]
    if (a && typeof a === 'object') s.agents[k] = { ...s.agents[k], ...a }
  }
  return s
}

// ---------- Transkript ----------

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'image'; path: string }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: unknown
      result?: { content: string; isError: boolean }
    }

export type TranscriptItem =
  | {
      type: 'user'
      id: string
      text: string
      ts: number
      attachments?: Attachment[]
      /** Zwischenruf in einen laufenden Turn */
      steer?: boolean
      /** Teil einer Zusammenführung (Aufarbeitung in B bzw. Übernahme in A). */
      merge?: MergeMark
    }
  | { type: 'assistant'; id: string; blocks: Block[] }
  | { type: 'error'; id: string; text: string }
  | { type: 'notice'; id: string; text: string }
  | {
      type: 'turn'
      id: string
      durationMs: number
      costUsd?: number
      costTotalUsd?: number
      isError: boolean
      model?: string
    }

export type Transcript = TranscriptItem[]

/**
 * Zusammenführung: Nebenchat B arbeitet auf (prepare), Chat A übernimmt (adopt).
 * `fromItemId` ist die Nutzernachricht in B, bis zu der übernommen wurde (für die Kante im Board).
 */
export type MergeMark =
  | { role: 'prepare'; targetId: string; targetTitle: string }
  | { role: 'adopt'; fromChatId: string; fromItemId?: string; fromTitle: string }

/** Wie voll das Kontextfenster zuletzt war (nach dem letzten Turn). */
export interface ContextUse {
  /** Tokens im Kontext der letzten Anfrage (inkl. zwischengespeicherter). */
  used: number
  /** Größe des Kontextfensters, soweit die CLI sie nennt. */
  max?: number
  at: number
}

/** Stelle im Ursprungs-Chat, an der abgezweigt wurde. */
export interface ForkPoint {
  /** Anzahl der Turns (Nutzernachrichten) im Ursprung zum Zeitpunkt des Abzweigens. */
  turn: number
  /** Eintrag im Transkript des Ursprungs, aus dem das Zitat stammt. */
  itemId?: string
  /** Zitierte Stelle (gekürzt). */
  quote?: string
}

/** Normalisierte Events, die ein Agent-Adapter liefert. */
export type AgentEvent =
  | { kind: 'user'; id: string; text: string; ts: number; attachments?: Attachment[]; steer?: boolean; merge?: MergeMark }
  | { kind: 'text-delta'; msgId: string; index: number; text: string; blockType: 'text' | 'thinking' }
  | { kind: 'assistant'; msgId: string; blocks: Block[]; /** Position des ersten Blocks in der Nachricht; fehlt = anhängen */ index?: number }
  | { kind: 'tool-result'; toolUseId: string; content: string; isError: boolean }
  | {
      kind: 'turn-end'
      id: string
      durationMs: number
      costUsd?: number
      /** Kumulierte Kosten der Session (Claude); der Reducer rechnet daraus die Kosten des Turns. */
      costTotalUsd?: number
      isError: boolean
      errorText?: string
      /** Modell, das den Turn beantwortet hat (soweit bekannt). */
      model?: string
    }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'notice'; id: string; text: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'context'; used: number; max?: number }

// ---------- Layout ----------

export type LayoutNode =
  | {
      type: 'leaf'
      id: string
      chatId: string | null
      /** Diskursboard statt Chat: Wurzel-Chat des Baums (dann ist chatId null). */
      board?: string
    }
  | { type: 'split'; id: string; direction: 'row' | 'column'; children: LayoutNode[]; sizes: number[] }

export interface LayoutState {
  root: LayoutNode
  selectedCellId: string
}
