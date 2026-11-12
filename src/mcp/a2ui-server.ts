// MCP-Server „a2ui“ (stdio) mit dem Tool render_ui.
// Wird von der Claude CLI gestartet (über --mcp-config), läuft mit dem Node aus Electron
// (ELECTRON_RUN_AS_NODE=1). Er prüft A2UI-Nachrichten gegen den Basic Catalog und meldet
// Fehler an das Modell zurück. Angezeigt werden die Screens von der App selbst: Sie liest den
// Tool-Aufruf samt Ergebnis aus dem Stream der CLI.
//
// A2UI_STATE_FILE: JSON-Datei mit allen bisher angenommenen Nachrichten des Chats (schreibt die
// App vor dem Start), damit Updates auf bestehende Screens auch nach einem Neustart prüfbar sind.

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { A2UI_SERVER, A2UI_TOOL, A2UI_ACTION_PREFIX, BASIC_CATALOG_ID, callMessages, type A2uiMessage } from '@shared/a2ui'
import { validate } from './validate'

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
Vor dem ersten Screen den Skill "a2ui" laden (Protokoll, Komponenten, Beispiele).`

const TOOL = {
  name: A2UI_TOOL,
  description: `Zeigt eine A2UI-v1.0-Oberfläche im Chat des Nutzers an oder aktualisiert eine bestehende in-place.
Eingabe: {"messages": [...]} mit A2UI-Nachrichten (createSurface, updateComponents, updateDataModel, deleteSurface),
Katalog: ${BASIC_CATALOG_ID}. Bestehende Screens per surfaceId aktualisieren statt neu anlegen.
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
  const incoming = callMessages(args)
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
      return reply(id, { tools: [TOOL] })
    case 'tools/call': {
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
