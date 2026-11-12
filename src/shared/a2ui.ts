import { expandComposites } from './a2ui-composites'
import type { Block, Transcript } from './types'

// Gemeinsame A2UI-Bausteine für Main-Prozess, MCP-Server und Renderer.

export const A2UI_SERVER = 'a2ui'
export const A2UI_TOOL = 'render_ui'
/** So heißt das Tool in den Tool-Aufrufen der Claude CLI. */
export const A2UI_TOOL_FULL = `mcp__${A2UI_SERVER}__${A2UI_TOOL}`
export const A2UI_VERSION = '1.0'
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'
/** Katalog von Claude2UI: Basic Catalog + Charts + Image mit lokalen Dateien (siehe a2ui-catalog.ts). */
export const CLAUDE2UI_CATALOG_ID = 'https://claude2ui.local/catalogs/v1/catalog.json'
/** Protokoll, über das der Renderer lokale Bilder lädt. */
export const LOCAL_FILE_SCHEME = 'c2ui-file'
/** Präfix der Nutzernachricht, mit der eine Button-Aktion an den Agenten geht. */
export const A2UI_ACTION_PREFIX = 'A2UI-Aktion: '

export type A2uiMessage = Record<string, any>

/** Namen aller eingebauten Komponenten (Basic Catalog + Claude2UI); eigene dürfen sie nicht überschreiben. */
export const BUILTIN_COMPONENT_NAMES = [
  'Text', 'Image', 'Icon', 'Video', 'AudioPlayer', 'Row', 'Column', 'List', 'Card', 'Tabs', 'Modal', 'Divider',
  'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput',
  'LineChart', 'BarChart', 'PieChart', 'ScatterChart', 'Table', 'Metric', 'Progress', 'Alert', 'Badge', 'CodeBlock'
]

export function isA2uiCall(b: Block): boolean {
  return b.type === 'tool_use' && (b.name === A2UI_TOOL_FULL || b.name.endsWith(`__${A2UI_TOOL}`))
}

/** Nachrichten eines render_ui-Aufrufs, vereinheitlicht (Version/Katalog ergänzt). */
export function callMessages(input: unknown): A2uiMessage[] {
  return rawCallMessages(input).map(normalizeMessage)
}

/** Nachrichten eines render_ui-Aufrufs, so wie das Modell sie geschickt hat (für Prüfungen vor dem Auflösen). */
export function rawCallMessages(input: unknown): A2uiMessage[] {
  const raw = (input as { messages?: unknown })?.messages
  const list = typeof raw === 'string' ? safeParse(raw) : raw
  return Array.isArray(list) ? list.filter((m) => m && typeof m === 'object') : []
}

/**
 * Vereinheitlicht eine Nachricht: Version ergänzen, Katalog auf den von Claude2UI setzen.
 * Der Claude2UI-Katalog enthält den Basic Catalog vollständig – eine Basic-ID wird deshalb
 * verlustfrei umgeschrieben (sonst fehlten Table, Charts usw., wenn ein Modell die alte ID nutzt).
 */
export function normalizeMessage(m: A2uiMessage): A2uiMessage {
  const out: A2uiMessage = { ...m, version: m.version ?? A2UI_VERSION }
  const cat = (id: unknown): unknown => (id === undefined || id === BASIC_CATALOG_ID ? CLAUDE2UI_CATALOG_ID : id)
  const comps = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((c) => (c && typeof c === 'object' && c['@catalogId'] === BASIC_CATALOG_ID ? { ...c, '@catalogId': CLAUDE2UI_CATALOG_ID } : c))
      : list
  if (out.createSurface) {
    out.createSurface = { ...out.createSurface, catalogId: cat(out.createSurface.catalogId) }
    if (out.createSurface.components) out.createSurface.components = expandComposites(comps(out.createSurface.components))
  }
  if (out.updateComponents?.components) {
    out.updateComponents = { ...out.updateComponents, components: expandComposites(comps(out.updateComponents.components)) }
  }
  return out
}

/** Alle erfolgreich angewendeten A2UI-Nachrichten eines Transkripts, in Reihenfolge. */
export function acceptedMessages(t: Transcript): A2uiMessage[] {
  const out: A2uiMessage[] = []
  for (const item of t) {
    if (item.type !== 'assistant') continue
    for (const b of item.blocks) {
      if (b.type === 'tool_use' && isA2uiCall(b) && b.result && !b.result.isError) out.push(...callMessages(b.input))
    }
  }
  return out
}

export function surfaceIdOf(m: A2uiMessage): string | undefined {
  const body = m.createSurface ?? m.updateComponents ?? m.updateDataModel ?? m.deleteSurface
  return typeof body?.surfaceId === 'string' ? body.surfaceId : undefined
}

/** Prüft, ob alle per ID referenzierten Kinder existieren (der Processor tut das nicht). */
export function danglingRefs(components: Map<string, { properties?: any }> | Record<string, any>): string[] {
  const entries: [string, any][] =
    components instanceof Map ? [...components.entries()] : Object.entries(components)
  const ids = new Set(entries.map(([id]) => id))
  const missing: string[] = []
  const check = (from: string, ref: unknown): void => {
    if (typeof ref === 'string' && !ids.has(ref)) missing.push(`„${from}“ verweist auf fehlende Komponente „${ref}“`)
  }
  for (const [id, c] of entries) {
    const p = c?.properties ?? c ?? {}
    for (const key of ['child', 'trigger', 'content']) check(id, p[key])
    if (Array.isArray(p.children)) p.children.forEach((r: unknown) => check(id, r))
    else if (p.children && typeof p.children === 'object') check(id, p.children.componentId)
    if (Array.isArray(p.tabs)) p.tabs.forEach((t: any) => check(id, t?.child))
  }
  return missing
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
