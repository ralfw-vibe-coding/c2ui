/**
 * Eigene, zusammengesetzte A2UI-Komponenten („Composites“), definiert in
 * `<userData>/components/<Name>/component.json`. Eine Instanz wird beim Normalisieren der
 * Nachrichten zu den Komponenten ihrer Vorlage aufgelöst – Validator und Renderer sehen nur
 * bekannte Komponenten. Reiner, umgebungsunabhängiger Code (Main, MCP-Server, Renderer).
 */

export type CompositePropType =
  | 'DynamicString'
  | 'DynamicNumber'
  | 'DynamicBoolean'
  | 'DynamicValue'
  | 'Action'
  | 'Child'
  | 'ChildList'
  | 'string'
  | 'number'
  | 'boolean'

export interface CompositeProp {
  type: CompositePropType
  description?: string
  required?: boolean
  enum?: string[]
  default?: unknown
}

export interface CompositeDef {
  name: string
  description: string
  properties: Record<string, CompositeProp>
  /** Komponenten der Vorlage; eine davon hat "id": "root". Platzhalter: "$eigenschaft". */
  template: Record<string, any>[]
  /** Beispiel-Instanz (ohne id/component), für die Doku. */
  example?: Record<string, unknown>
}

const PROP_TYPES: CompositePropType[] = [
  'DynamicString', 'DynamicNumber', 'DynamicBoolean', 'DynamicValue', 'Action', 'Child', 'ChildList', 'string', 'number', 'boolean'
]
const NAME_RE = /^[A-Z][A-Za-z0-9]*$/
const INSTANCE_KEYS = new Set(['id', 'component', 'weight'])
const MAX_DEPTH = 5

// ---------- Registry ----------

let registry = new Map<string, CompositeDef>()

export function setComposites(defs: CompositeDef[]): void {
  registry = new Map(defs.map((d) => [d.name, d]))
}

export function getComposites(): CompositeDef[] {
  return [...registry.values()]
}

export function getComposite(name: string): CompositeDef | undefined {
  return registry.get(name)
}

// ---------- Definition prüfen ----------

/** Prüft eine geladene component.json. `reserved`: Namen eingebauter Komponenten. */
export function parseCompositeDef(raw: unknown, reserved: Set<string>): { def?: CompositeDef; errors: string[] } {
  const errors: string[] = []
  const j = raw as Record<string, any>
  if (!j || typeof j !== 'object') return { errors: ['keine JSON-Objekt-Definition'] }
  if (typeof j.name !== 'string' || !NAME_RE.test(j.name)) errors.push('„name“ fehlt oder ist kein Name in PascalCase (z. B. "ContactCard").')
  else if (reserved.has(j.name)) errors.push(`„${j.name}“ ist eine eingebaute Komponente und kann nicht überschrieben werden.`)
  if (typeof j.description !== 'string' || !j.description.trim()) errors.push('„description“ fehlt.')
  const props = j.properties ?? {}
  if (typeof props !== 'object' || Array.isArray(props)) errors.push('„properties“ muss ein Objekt sein.')
  else {
    for (const [k, p] of Object.entries<any>(props)) {
      if (INSTANCE_KEYS.has(k)) errors.push(`Eigenschaft „${k}“ ist reserviert.`)
      if (!p || !PROP_TYPES.includes(p.type)) errors.push(`Eigenschaft „${k}“: „type“ muss einer von ${PROP_TYPES.join(', ')} sein.`)
      if (p?.enum && (!Array.isArray(p.enum) || !p.enum.every((x: unknown) => typeof x === 'string'))) errors.push(`Eigenschaft „${k}“: „enum“ muss eine Liste von Texten sein.`)
    }
  }
  const tpl = j.template
  if (!Array.isArray(tpl) || tpl.length === 0) errors.push('„template“ muss eine nicht leere Liste von Komponenten sein.')
  else {
    const ids = new Set<string>()
    for (const c of tpl) {
      if (!c || typeof c.id !== 'string' || typeof c.component !== 'string') errors.push('Jede Vorlagen-Komponente braucht „id“ und „component“.')
      else if (ids.has(c.id)) errors.push(`Vorlagen-ID „${c.id}“ doppelt.`)
      else ids.add(c.id)
    }
    if (!ids.has('root')) errors.push('Die Vorlage braucht eine Komponente mit "id": "root".')
    // Platzhalter müssen deklarierte Eigenschaften sein
    for (const ph of placeholders(tpl)) if (!props[ph]) errors.push(`Platzhalter „$${ph}“ ist keine deklarierte Eigenschaft.`)
  }
  if (errors.length) return { errors }
  return {
    def: { name: j.name, description: j.description.trim(), properties: props, template: tpl, example: j.example },
    errors
  }
}

function placeholders(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') {
    const m = v.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/)
    if (m) out.add(m[1])
  } else if (Array.isArray(v)) v.forEach((x) => placeholders(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => placeholders(x, out))
  return out
}

// ---------- Instanzen prüfen ----------

const isBinding = (v: unknown): boolean =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('@path' in (v as object) || '@call' in (v as object) || 'path' in (v as object))

function typeOk(t: CompositePropType, v: unknown): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string'
    case 'number':
      return typeof v === 'number'
    case 'boolean':
      return typeof v === 'boolean'
    case 'DynamicString':
      return typeof v === 'string' || isBinding(v)
    case 'DynamicNumber':
      return typeof v === 'number' || isBinding(v)
    case 'DynamicBoolean':
      return typeof v === 'boolean' || isBinding(v)
    case 'DynamicValue':
      return v !== undefined
    case 'Action':
      return !!v && typeof v === 'object' && ('event' in (v as object) || 'functionCall' in (v as object))
    case 'Child':
      return typeof v === 'string'
    case 'ChildList':
      return (Array.isArray(v) && v.every((x) => typeof x === 'string')) || (!!v && typeof v === 'object' && 'componentId' in (v as object))
  }
}

/** Fehler einer Instanz einer eigenen Komponente (fehlende/unbekannte/falsche Eigenschaften). */
export function checkCompositeInstance(c: Record<string, any>, def: CompositeDef): string[] {
  const errors: string[] = []
  for (const [k, p] of Object.entries(def.properties)) {
    const v = c[k]
    if (v === undefined) {
      if (p.required && p.default === undefined) errors.push(`Eigenschaft „${k}“ fehlt.`)
      continue
    }
    if (!typeOk(p.type, v)) errors.push(`Eigenschaft „${k}“ hat nicht den Typ ${p.type}.`)
    else if (p.enum && typeof v === 'string' && !p.enum.includes(v)) errors.push(`Eigenschaft „${k}“ muss einer von ${p.enum.join(', ')} sein.`)
  }
  for (const k of Object.keys(c)) {
    if (!INSTANCE_KEYS.has(k) && !k.startsWith('@') && !def.properties[k]) {
      errors.push(`Unbekannte Eigenschaft „${k}“ (vorhanden: ${Object.keys(def.properties).join(', ') || '–'}).`)
    }
  }
  return errors.map((e) => `${def.name} „${c.id}“: ${e}`)
}

// ---------- Auflösen ----------

const REF_KEYS = ['child', 'trigger', 'content']

/** Löst Instanzen eigener Komponenten in einer Komponentenliste auf (rekursiv). */
export function expandComposites(components: unknown, depth = 0): unknown {
  if (!Array.isArray(components) || registry.size === 0) return components
  const out: unknown[] = []
  for (const c of components) {
    const def = c && typeof c === 'object' ? registry.get((c as any).component) : undefined
    if (!def) {
      out.push(c)
      continue
    }
    if (depth >= MAX_DEPTH) {
      out.push(c) // wird dann als unbekannte Komponente gemeldet
      continue
    }
    const expanded = instantiate(def, c as Record<string, any>)
    out.push(...((expandComposites(expanded, depth + 1) as unknown[]) ?? []))
  }
  return out
}

function instantiate(def: CompositeDef, inst: Record<string, any>): Record<string, any>[] {
  const localIds = new Set(def.template.map((t) => t.id))
  const rid = (id: string): string => (id === 'root' ? inst.id : `${inst.id}__${id}`)
  const ref = (v: unknown): unknown => (typeof v === 'string' && localIds.has(v) ? rid(v) : v)
  const values: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(def.properties)) values[k] = inst[k] !== undefined ? inst[k] : p.default

  // Teile der Vorlage, deren Eigenschaft direkt einen fehlenden optionalen Wert anzeigen soll,
  // entfallen (z. B. das Image für ein nicht angegebenes Foto).
  const removed = new Set<string>()
  for (const t of def.template) {
    for (const [k, v] of Object.entries(t)) {
      if (k === 'id' || k === 'component') continue
      if (t.id === 'root') continue
      // direktes Feld mit ganzem Platzhalter ("$email") ohne Wert
      const whole = typeof v === 'string' ? v.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/) : null
      if (whole && whole[1] in values && values[whole[1]] === undefined) removed.add(t.id)
      // irgendwo eingebetteter Platzhalter ("mailto:$email") ohne Wert – der Teil wäre sinnlos
      if (deepStrings(v).some((str) => !/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(str) && tokens(str, values).some((n) => values[n] === undefined))) {
        removed.add(t.id)
      }
    }
  }
  // Eltern, deren einziges Kind entfällt, entfallen mit (außer root).
  for (let changed = true; changed; ) {
    changed = false
    for (const t of def.template) {
      if (t.id === 'root' || removed.has(t.id)) continue
      if (REF_KEYS.some((k) => typeof t[k] === 'string' && removed.has(t[k]))) {
        removed.add(t.id)
        changed = true
      }
    }
  }
  const keep = (v: unknown): boolean => !(typeof v === 'string' && removed.has(v))

  return def.template
    .filter((t) => !removed.has(t.id))
    .map((t) => {
      // 1. IDs und Verweise innerhalb der Vorlage umbenennen
      const c: Record<string, any> = { ...t, id: rid(t.id) }
      for (const k of REF_KEYS) if (k in c) c[k] = ref(c[k])
      if (Array.isArray(c.children)) c.children = c.children.filter(keep).map(ref)
      else if (c.children && typeof c.children === 'object' && typeof c.children.componentId === 'string') {
        c.children = { ...c.children, componentId: ref(c.children.componentId) }
      }
      if (Array.isArray(c.tabs)) c.tabs = c.tabs.filter((tab: any) => keep(tab?.child)).map((tab: any) => ({ ...tab, child: ref(tab?.child) }))
      // 2. Platzhalter durch Werte der Instanz ersetzen (fehlende optionale Werte entfallen)
      const filled = substitute(c, values) as Record<string, any>
      if (t.id === 'root' && inst.weight !== undefined) filled.weight = inst.weight
      return filled
    })
}

const OMIT = Symbol('omit')
const TOKEN = /\$([A-Za-z_][A-Za-z0-9_]*)/g

/** Namen deklarierter Eigenschaften, die in einem Text als $name vorkommen. */
function tokens(text: string, values: Record<string, unknown>): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]).filter((n) => n in values)
}

function deepStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => deepStrings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => deepStrings(x, out))
  return out
}

const bindingPath = (v: unknown): string | undefined => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const p = o['@path'] ?? o.path
  return typeof p === 'string' ? p : undefined
}

function substitute(v: unknown, values: Record<string, unknown>): unknown {
  if (typeof v === 'string') {
    // Ganzer Platzhalter: Wert unverändert einsetzen (auch Bindungen, Aktionen, Listen …)
    const m = v.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/)
    if (m && m[1] in values) return values[m[1]] === undefined ? OMIT : values[m[1]]
    return interpolate(v, values)
  }
  if (Array.isArray(v)) return v.map((x) => substitute(x, values)).filter((x) => x !== OMIT)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      const sv = substitute(x, values)
      if (sv !== OMIT) o[k] = sv
    }
    return o
  }
  return v
}

/**
 * Platzhalter mitten im Text ("mailto:$email", "Hallo $name!"). Feste Werte werden eingesetzt;
 * ist ein Wert eine Bindung {"@path": …}, wird daraus formatString, damit er live bleibt.
 * Nicht deklarierte $wörter bleiben stehen (z. B. Preise).
 */
function interpolate(text: string, values: Record<string, unknown>): unknown {
  const names = tokens(text, values)
  if (!names.length) return text
  if (names.some((n) => values[n] === undefined)) return OMIT
  const dynamic = names.some((n) => values[n] !== null && typeof values[n] === 'object')
  if (!dynamic) return text.replace(TOKEN, (all, n) => (n in values ? String(values[n]) : all))
  const esc = (s: string): string => s.replace(/\$\{/g, '\\${')
  let out = ''
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const n = m[1]
    if (!(n in values)) continue
    out += esc(text.slice(last, m.index))
    const val = values[n]
    const path = bindingPath(val)
    if (path) out += '${' + path + '}'
    else if (val !== null && typeof val === 'object') out += '' // Funktionsaufrufe lassen sich hier nicht einbetten
    else out += esc(String(val))
    last = (m.index ?? 0) + m[0].length
  }
  out += esc(text.slice(last))
  return { '@call': 'formatString', args: { value: out } }
}

// ---------- Doku ----------

/** Markdown-Doku einer eigenen Komponente (für describe_components). */
export function compositeDoc(def: CompositeDef): string {
  const lines = [`### ${def.name} (eigene Komponente)`, def.description, '']
  for (const [k, p] of Object.entries(def.properties)) {
    const req = p.required && p.default === undefined ? ' **Pflicht**' : ''
    const en = p.enum ? ` (${p.enum.map((e) => `'${e}'`).join(' | ')})` : ''
    const df = p.default !== undefined ? ` (Standard: ${JSON.stringify(p.default)})` : ''
    lines.push(`- \`${k}\`${req}: ${p.type}${en}${df}${p.description ? ' – ' + p.description : ''}`)
  }
  if (def.example) {
    lines.push('', 'Beispiel:', '```json', JSON.stringify({ id: 'beispiel', component: def.name, ...def.example }), '```')
  }
  return lines.join('\n')
}
