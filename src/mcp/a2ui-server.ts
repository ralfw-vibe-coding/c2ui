// MCP-Server „a2ui“ (stdio) mit dem Tool render_ui.
// Wird von der Claude CLI gestartet (über --mcp-config), läuft mit dem Node aus Electron
// (ELECTRON_RUN_AS_NODE=1). Er prüft A2UI-Nachrichten gegen den Basic Catalog und meldet
// Fehler an das Modell zurück. Angezeigt werden die Screens von der App selbst: Sie liest den
// Tool-Aufruf samt Ergebnis aus dem Stream der CLI.
//
// A2UI_STATE_FILE: JSON-Datei mit allen bisher angenommenen Nachrichten des Chats (schreibt die
// App vor dem Start), damit Updates auf bestehende Screens auch nach einem Neustart prüfbar sind.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  A2UI_ACTION_PREFIX,
  A2UI_SERVER,
  A2UI_TOOL,
  BUILTIN_COMPONENT_NAMES,
  CLAUDE2UI_CATALOG_ID,
  rawCallMessages,
  type A2uiMessage
} from '@shared/a2ui'
import { compositeDoc, getComposites, setComposites } from '@shared/a2ui-composites'
import { loadComposites } from '../main/componentsLoader'
import { validate } from './validate'

/** Eigene Komponenten bei jedem Aufruf neu laden – neue Dateien wirken sofort. */
function refreshComposites(): string[] {
  const dir = process.env.A2UI_COMPONENTS_DIR
  if (!dir) return []
  const r = loadComposites(dir)
  setComposites(r.defs)
  return r.errors
}

const history: A2uiMessage[] = loadHistory()

function loadHistory(): A2uiMessage[] {
  const f = process.env.A2UI_STATE_FILE
  if (!f) return []
  try {
    const data = JSON.parse(readFileSync(f, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

const INSTRUCTIONS = `Dieser Server zeigt A2UI-Oberflächen (v1.0, Basic Catalog) direkt im Chat der App Claude2UI an.
Nutze render_ui nur, wenn der Nutzer eine Oberfläche wünscht oder mit einem Screen interagiert
(Nachrichten, die mit "${A2UI_ACTION_PREFIX.trim()}" beginnen). Sonst normal mit Text antworten.
Vor dem ersten Screen den Skill "a2ui" laden (Protokoll, Komponenten, Beispiele).
describe_components listet alle verfügbaren Komponenten – auch eigene des Nutzers – und liefert ihre Doku.`

const DESCRIBE_TOOL = 'describe_components'

const DESCRIBE = {
  name: DESCRIBE_TOOL,
  description: `Liefert die verfügbaren A2UI-Komponenten von Claude2UI: eingebaute (Basic Catalog, Charts, Table, Metric …)
und eigene Komponenten des Nutzers. Ohne Argument: Übersicht plus vollständige Doku der eigenen Komponenten.
Mit "names": Doku genau dieser Komponenten. Vor dem Bau eines Screens aufrufen, um eigene Komponenten zu kennen.`,
  inputSchema: {
    type: 'object',
    properties: { names: { type: 'array', items: { type: 'string' }, description: 'Komponentennamen, z. B. ["Table", "ContactCard"].' } }
  },
  annotations: { readOnlyHint: true }
}

/** Abschnitt „### Name“ aus der Skill-Referenz (eingebaute Komponenten). */
function builtinDoc(name: string): string | undefined {
  const dir = process.env.A2UI_SKILL_DIR
  if (!dir) return undefined
  try {
    const ref = readFileSync(join(dir, 'reference.md'), 'utf8')
    const re = new RegExp(`^### ${name}\\b[^\\n]*\\n([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, 'm')
    const m = ref.match(re)
    return m ? `### ${name}\n${m[1].trim()}` : undefined
  } catch {
    return undefined
  }
}

function describeComponents(args: Record<string, any>): string {
  const loadErrors = refreshComposites()
  const custom = getComposites()
  const names: string[] = Array.isArray(args?.names) ? args.names.filter((n: unknown) => typeof n === 'string') : []
  if (names.length) {
    return names
      .map((n) => {
        const c = custom.find((d) => d.name === n)
        if (c) return compositeDoc(c)
        return builtinDoc(n) ?? `### ${n}\nUnbekannte Komponente.`
      })
      .join('\n\n')
  }
  const dir = process.env.A2UI_COMPONENTS_DIR
  const parts = [
    `catalogId: ${CLAUDE2UI_CATALOG_ID}`,
    ...(dir
      ? [`Eigene Komponenten liegen in ${dir}/<Name>/component.json – Anleitung zum Anlegen und Ändern: ${dir}/ANLEITUNG.md.`]
      : []),
    `Eingebaute Komponenten: ${BUILTIN_COMPONENT_NAMES.join(', ')} (Doku: Skill-Referenz oder describe_components mit "names").`,
    custom.length
      ? `Eigene Komponenten des Nutzers (${custom.length}) – wie eingebaute verwenden, mit denselben Eigenschaften wie dokumentiert:\n\n` +
        custom.map(compositeDoc).join('\n\n')
      : 'Eigene Komponenten des Nutzers: keine.'
  ]
  if (loadErrors.length) parts.push('Nicht geladene eigene Komponenten (fehlerhaft):\n' + loadErrors.map((e) => '- ' + e).join('\n'))
  return parts.join('\n\n')
}

const TOOL = {
  name: A2UI_TOOL,
  description: `Zeigt eine A2UI-v1.0-Oberfläche im Chat des Nutzers an oder aktualisiert eine bestehende in-place.
Eingabe: {"messages": [...]} mit A2UI-Nachrichten (createSurface, updateComponents, updateDataModel, deleteSurface),
Katalog: ${CLAUDE2UI_CATALOG_ID}. Bestehende Screens per surfaceId aktualisieren statt neu anlegen.
Eigene Komponenten des Nutzers sind erlaubt (siehe describe_components).
Bei Validierungsfehlern wird nichts angezeigt: korrigieren und erneut aufrufen. Details und Beispiele: Skill "a2ui".`,
  inputSchema: {
    type: 'object',
    properties: {
      messages: {
        type: 'array',
        description: 'A2UI-v1.0-Nachrichten, werden der Reihe nach angewendet.',
        items: { type: 'object' }
      }
    },
    required: ['messages']
  }
}

type Json = Record<string, any>

function send(msg: Json): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function reply(id: unknown, result: Json): void {
  send({ jsonrpc: '2.0', id, result })
}

function fail(id: unknown, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function renderUi(args: Json): { text: string; isError: boolean } {
  refreshComposites()
  const incoming = rawCallMessages(args)
  const r = validate(history, incoming)
  if (!r.ok) {
    return {
      isError: true,
      text:
        'Validierung fehlgeschlagen – es wurde nichts angezeigt:\n' +
        r.errors.map((e) => '- ' + e).join('\n') +
        '\nBitte korrigieren und render_ui mit allen Nachrichten dieses Aufrufs erneut aufrufen.'
    }
  }
  history.push(...incoming)
  const parts: string[] = []
  if (r.created.length) parts.push(`neu angezeigt: ${r.created.map((s) => `„${s}“`).join(', ')}`)
  if (r.updated.length) parts.push(`in-place aktualisiert: ${r.updated.map((s) => `„${s}“`).join(', ')}`)
  return {
    isError: false,
    text:
      `OK – ${parts.join('; ') || 'angewendet'}. Der Nutzer sieht den Screen jetzt im Chat; ` +
      `den Inhalt nicht zusätzlich als Text wiederholen. Button-Aktionen kommen als Nachricht „${A2UI_ACTION_PREFIX.trim()} {…}“.`
  }
}

function handle(msg: Json): void {
  const { id, method, params } = msg
  const isRequest = id !== undefined && id !== null
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: A2UI_SERVER, version: '0.1.0' },
        instructions: INSTRUCTIONS
      })
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return
    case 'ping':
      return reply(id, {})
    case 'tools/list':
      return reply(id, { tools: [TOOL, DESCRIBE] })
    case 'tools/call': {
      if (params?.name === DESCRIBE_TOOL) {
        let text: string
        try {
          text = describeComponents(params.arguments ?? {})
        } catch (e) {
          return reply(id, { content: [{ type: 'text', text: `Fehler: ${(e as Error).message}` }], isError: true })
        }
        return reply(id, { content: [{ type: 'text', text }], isError: false })
      }
      if (params?.name !== A2UI_TOOL) return fail(id, -32602, `Unbekanntes Tool: ${params?.name}`)
      let r: { text: string; isError: boolean }
      try {
        r = renderUi(params.arguments ?? {})
      } catch (e) {
        r = { isError: true, text: `Interner Fehler im A2UI-Server: ${(e as Error).message}` }
      }
      return reply(id, { content: [{ type: 'text', text: r.text }], isError: r.isError })
    }
    default:
      if (isRequest) fail(id, -32601, `Methode nicht unterstützt: ${method}`)
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  try {
    handle(JSON.parse(t))
  } catch (e) {
    process.stderr.write(`[a2ui] ungültige Nachricht: ${(e as Error).message}\n`)
  }
})
rl.on('close', () => process.exit(0))
