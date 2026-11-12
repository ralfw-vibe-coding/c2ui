import type { AgentEvent, Chat, Settings } from '@shared/types'

/**
 * Ein laufender oder ruhender Gesprächskanal zu einer CLI (Claude, später Codex).
 * Die Implementierung entscheidet selbst, ob sie einen Prozess dauerhaft hält.
 */
export interface AgentSession {
  readonly busy: boolean
  /** Startet einen Turn. Darf nur aufgerufen werden, wenn !busy. */
  send(text: string): void
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
  /** Zusätzliche CLI-Argumente für A2UI (Plugin, MCP-Server); wird direkt vor dem Start aufgerufen. */
  a2uiArgs?(): string[]
}

export type AgentFactory = (ctx: AgentContext, cb: AgentCallbacks) => AgentSession
