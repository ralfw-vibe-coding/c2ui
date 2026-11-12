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
}

const serverEnv = (s: A2uiSetup) => ({ ELECTRON_RUN_AS_NODE: '1', A2UI_STATE_FILE: s.stateFile })

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
    '--allowedTools', A2UI_TOOL_FULL
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
    '-c', `${p}.command=${toml(s.execPath)}`,
    '-c', `${p}.args=${toml([s.serverScript])}`,
    '-c', `${p}.env=${toml(serverEnv(s))}`,
    '-c', `${p}.startup_timeout_sec=30`,
    // Ohne Freigabe bricht Codex im exec-Modus MCP-Aufrufe ab.
    '-c', `${p}.tools.${A2UI_TOOL}.approval_mode="approve"`
  ]
  return {
    args,
    env: { HOME: home, CODEX_HOME: process.env.CODEX_HOME || join(realHome, '.codex') }
  }
}
