import { homedir } from 'node:os'
import { join } from 'node:path'
import { A2UI_SERVER, A2UI_TOOL, A2UI_TOOL_FULL } from '@shared/a2ui'
import { prepareShadowHome } from '../shadowHome'

/** Alles, was ein CLI-Prozess braucht, um A2UI zu nutzen (vom ChatManager pro Start erzeugt). */
export interface A2uiSetup {
  /** Plugin-Verzeichnis (Claude: --plugin-dir). */
  pluginDir: string
  /** Verzeichnis des Skills „a2ui“ (SKILL.md + reference.md). */
  skillDir: string
  serverScript: string
  /** Programm, das den MCP-Server ausführt (Electron als Node). */
  execPath: string
  /** Bisher angenommene A2UI-Nachrichten des Chats (für den MCP-Server). */
  stateFile: string
  /** Verzeichnis für das Schatten-Home von Codex. */
  shadowHomeDir: string
  /** Ordner mit eigenen Komponenten (`<Name>/component.json`). */
  componentsDir: string
}

const serverEnv = (s: A2uiSetup) => ({
  ELECTRON_RUN_AS_NODE: '1',
  A2UI_STATE_FILE: s.stateFile,
  A2UI_COMPONENTS_DIR: s.componentsDir,
  A2UI_SKILL_DIR: s.skillDir
})
const DESCRIBE_TOOL = 'describe_components'

/** Zusätzliche Systemanweisung für Werkstatt-Chats (eigene Komponenten bauen/bearbeiten). */
export function workshopPrompt(componentsDir: string): string {
  return `Du bist in der Komponenten-Werkstatt von Claude2UI. Dein Arbeitsverzeichnis ist der Ordner mit den eigenen
A2UI-Komponenten des Nutzers (${componentsDir}). Jede Komponente ist ein Unterordner mit einer component.json:
eine Vorlage aus vorhandenen A2UI-Komponenten mit eigenen Eigenschaften. Das Format steht vollständig in ANLEITUNG.md
in diesem Ordner – lies sie zu Beginn, bevor du etwas anlegst oder änderst.

Arbeitsweise:
1. Komponenten anlegen bzw. ändern, indem du <Name>/component.json schreibst (gültiges JSON, ohne Kommentare).
2. Danach describe_components (MCP-Server a2ui) aufrufen: Die Komponente muss in der Liste stehen; fehlerhafte Dateien
   stehen dort unter „Nicht geladene eigene Komponenten“ mit Grund – dann korrigieren.
3. Eine Vorschau zeigen: render_ui mit surfaceId "vorschau-<name in kleinbuchstaben>" und createSurface, mit 1–3 Instanzen
   (typische Werte, dazu eine Instanz ohne optionale Eigenschaften). Gibt es die Vorschau schon, KEIN neues createSurface:
   Die App zeichnet bestehende Screens nach jeder Änderung an einer Komponente automatisch neu. Nur wenn andere
   Beispielwerte nötig sind, die Vorschau per updateComponents/updateDataModel anpassen.
4. Kurz antworten: was geändert wurde, ggf. eine Frage. Die Vorschau nicht als Text beschreiben.`
}

/** Claude: Skill per Plugin, MCP-Server per --mcp-config, Tool ohne Rückfrage erlaubt. */
export function claudeA2uiArgs(s: A2uiSetup): string[] {
  const mcp = {
    mcpServers: {
      [A2UI_SERVER]: { type: 'stdio', command: s.execPath, args: [s.serverScript], env: serverEnv(s) }
    }
  }
  return [
    '--plugin-dir', s.pluginDir,
    // Damit Claude die Referenz des Skills lesen darf, obwohl sie außerhalb des Arbeitsverzeichnisses liegt.
    '--add-dir', join(s.pluginDir, 'skills'),
    '--mcp-config', JSON.stringify(mcp),
    // Eigene Komponenten dürfen aus jedem Chat heraus angelegt/geändert werden.
    '--add-dir', s.componentsDir,
    '--allowedTools', `${A2UI_TOOL_FULL},mcp__${A2UI_SERVER}__${DESCRIBE_TOOL}`
  ]
}

/** TOML-Wert für `-c key=value` (JSON-Strings sind gültige TOML-Basic-Strings). */
const toml = (v: unknown): string => {
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(toml).join(', ')}]`
  if (v && typeof v === 'object')
    return `{${Object.entries(v).map(([k, x]) => `${k} = ${toml(x)}`).join(', ')}}`
  return String(v)
}

/**
 * Codex: Skill über ein Schatten-Home ($HOME/.agents/skills), MCP-Server per `-c mcp_servers.…`.
 * CODEX_HOME bleibt das echte ~/.codex (Login, Konfiguration, Sessions). Befehle, die Codex
 * ausführt, sehen über shell_environment_policy wieder das echte HOME.
 */
export function codexA2uiLaunch(s: A2uiSetup): { args: string[]; env: Record<string, string> } {
  const realHome = homedir()
  const home = prepareShadowHome(s.shadowHomeDir, realHome, { 'claude2ui-a2ui': s.skillDir })
  const p = `mcp_servers.${A2UI_SERVER}`
  const args = [
    '-c', `shell_environment_policy.set.HOME=${toml(realHome)}`,
    // Eigene Komponenten dürfen aus jedem Chat heraus angelegt/geändert werden.
    '-c', `sandbox_workspace_write.writable_roots=${toml([s.componentsDir])}`,
    '-c', `${p}.command=${toml(s.execPath)}`,
    '-c', `${p}.args=${toml([s.serverScript])}`,
    '-c', `${p}.env=${toml(serverEnv(s))}`,
    '-c', `${p}.startup_timeout_sec=30`,
    // Ohne Freigabe bricht Codex im exec-Modus MCP-Aufrufe ab.
    '-c', `${p}.tools.${A2UI_TOOL}.approval_mode="approve"`,
    '-c', `${p}.tools.${DESCRIBE_TOOL}.approval_mode="approve"`
  ]
  return {
    args,
    env: { HOME: home, CODEX_HOME: process.env.CODEX_HOME || join(realHome, '.codex') }
  }
}
