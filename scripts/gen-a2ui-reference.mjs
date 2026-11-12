// Erzeugt aus dem offiziellen A2UI-v1.0-Basic-Catalog (aus @a2ui/web_core) eine kompakte
// Markdown-Referenz für den Skill. Aufruf: node scripts/gen-a2ui-reference.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const schemas = join(root, 'node_modules/@a2ui/web_core/src/v1_0/schemas')
const catalog = JSON.parse(readFileSync(join(schemas, 'catalogs/basic/catalog.json'), 'utf8'))
const common = JSON.parse(readFileSync(join(schemas, 'common_types.json'), 'utf8')).$defs
const out = join(root, 'resources/a2ui-plugin/skills/a2ui/reference.md')

const firstSentence = (s = '') => {
  const t = s.replace(/\s+/g, ' ').trim()
  const m = t.match(/^(.+?[.!?])(\s|$)/)
  return m ? m[1] : t
}

function typeOf(p) {
  if (!p) return 'any'
  if (p.$ref) {
    const name = p.$ref.split('/').pop()
    return name === 'Weight' ? 'number' : name
  }
  if (p.enum) return p.enum.map((e) => `'${e}'`).join(' | ')
  if (p.const) return `'${p.const}'`
  if (p.type === 'array') return `${typeOf(p.items)}[]`
  if (p.type === 'object' && p.properties) {
    return `{ ${Object.entries(p.properties).map(([k, v]) => `${k}${(p.required ?? []).includes(k) ? '' : '?'}: ${typeOf(v)}`).join(', ')} }`
  }
  if (p.oneOf) return p.oneOf.map(typeOf).join(' | ')
  return p.type ?? 'any'
}

function componentProps(def) {
  const props = {}
  const required = new Set()
  let checkable = false
  const visit = (d) => {
    if (!d) return
    if (d.$ref?.endsWith('/Checkable')) checkable = true
    for (const part of d.allOf ?? []) visit(part)
    Object.assign(props, d.properties ?? {})
    for (const r of d.required ?? []) required.add(r)
  }
  visit(def)
  delete props.component
  return { props, required, checkable }
}

const lines = []
const CLAUDE2UI_CATALOG_ID = 'https://claude2ui.local/catalogs/v1/catalog.json'
lines.push('# A2UI v1.0 – Katalog von Claude2UI')
lines.push('')
lines.push(`catalogId: \`${CLAUDE2UI_CATALOG_ID}\` – enthält alle Komponenten des offiziellen Basic Catalog`)
lines.push('(unten) plus Charts und ein Image für lokale Dateien (am Ende). Diese catalogId bei createSurface verwenden.')
lines.push('')
lines.push('Automatisch erzeugt aus dem offiziellen Katalog (scripts/gen-a2ui-reference.mjs). Typen:')
lines.push('- `DynamicString|Number|Boolean|StringList|Value`: Literal ODER `{"@path": "/json/pointer"}` ODER Funktionsaufruf `{"@call": "name", "args": {...}}`.')
lines.push('- `ComponentId`/`Child`: ID einer anderen Komponente (Kinder immer per ID, nie inline).')
lines.push('- `ChildList`: Array von IDs ODER Vorlage `{"path": "/liste", "componentId": "vorlage"}`; in der Vorlage sind Pfade ohne führenden `/` relativ zum Listenelement.')
lines.push('- `Action`: `{"event": {"name": "...", "context": {...}}}` (geht an dich zurück) ODER `{"functionCall": {"@call": "openUrl", "args": {"url": "..."}}}` (lokal).')
lines.push('- Alle Komponenten haben `id` und `component`; optional `weight` (Flex-Anteil in Row/Column) und `checks` (bei Eingaben).')
lines.push('')
lines.push('## Komponenten des Basic Catalog')
for (const [name, def] of Object.entries(catalog.components)) {
  if (name === 'Image') continue // ersetzt durch das Image von Claude2UI (siehe unten)
  const { props, required, checkable } = componentProps(def)
  lines.push('')
  lines.push(`### ${name}${checkable ? ' (unterstützt `checks`)' : ''}`)
  if (def.description) lines.push(firstSentence(def.description))
  for (const [k, v] of Object.entries(props)) {
    if (k === 'weight') continue
    const desc = firstSentence(v.description ?? '')
    const def_ = v.default !== undefined ? ` (Standard: ${JSON.stringify(v.default)})` : ''
    lines.push(`- \`${k}\`${required.has(k) ? ' **Pflicht**' : ''}: ${typeOf(v)}${def_}${desc ? ' – ' + desc : ''}`)
  }
}
lines.push('')
lines.push('## Funktionen (`{"@call": "name", "args": {...}}`)')
for (const [name, def] of Object.entries(catalog.functions)) {
  const args = def.properties?.args
  const sig = args?.properties
    ? Object.entries(args.properties).map(([k, v]) => `${k}${(args.required ?? []).includes(k) ? '' : '?'}${v.type ? ': ' + typeOf(v) : ''}`).join(', ')
    : ''
  lines.push(`- \`${name}(${sig})\` → ${def.returnType ?? 'any'}: ${firstSentence(def.description)}`)
}
lines.push('')
lines.push('## Hinweise aus dem Katalog')
lines.push('')
lines.push(catalog.instructions.trim().replaceAll(catalog.catalogId, CLAUDE2UI_CATALOG_ID))
lines.push('')
lines.push(readFileSync(join(root, 'resources/a2ui-plugin/skills/a2ui/extra-components.md'), 'utf8').trim())
lines.push('')
writeFileSync(out, lines.join('\n'))
console.log('geschrieben:', out, `(${lines.length} Zeilen)`)
void common
