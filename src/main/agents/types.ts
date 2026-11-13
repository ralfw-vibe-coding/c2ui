import type { AgentEvent, Attachment, Chat, Settings } from '@shared/types'
import type { A2uiSetup } from './a2ui'

/**
 * Ein laufender oder ruhender Gesprächskanal zu einer CLI (Claude, später Codex).
 * Die Implementierung entscheidet selbst, ob sie einen Prozess dauerhaft hält.
 */
export interface AgentSession {
  readonly busy: boolean
  /** Startet einen Turn. Darf nur aufgerufen werden, wenn !busy. */
  send(text: string, attachments?: Attachment[]): void
  /** Zwischenruf in den laufenden Turn (nur wenn busy; nicht jeder Agent kann das). */
  steer?(text: string, attachments?: Attachment[]): void
  /** Bricht den laufenden Turn ab. */
  interrupt(): void
  /** Beendet einen eventuell laufenden Prozess. */
  dispose(): void
}

export interface AgentCallbacks {
  onEvent(e: AgentEvent): void
  onBusy(busy: boolean): void
}

export interface AgentContext {
  /** Liefert stets den aktuellen Chat-Stand (z. B. sessionStarted, permissionMode). */
  chat(): Chat
  settings(): Settings
  path: string
  /** A2UI-Einrichtung für diesen Chat; wird direkt vor jedem Prozessstart aufgerufen. */
  a2ui?(): A2uiSetup | null
  /** Anhang-Ordner des Chats (Claude darf ihn lesen). */
  attachmentsDir?(): string | undefined
  /** Bisheriger Verlauf als Text (für einen Neustart ohne resume), ohne die aktuelle Nachricht. */
  history?(): string
  /** Verlauf des Chats, aus dem dieser abgezweigt wurde (für den ersten Turn ohne Fork der CLI). */
  forkHistory?(): string
}

export type AgentFactory = (ctx: AgentContext, cb: AgentCallbacks) => AgentSession
