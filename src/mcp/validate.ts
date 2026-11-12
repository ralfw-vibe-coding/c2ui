import { basicCatalog, MessageProcessor } from '@a2ui/web_core/v1_0'
import { buildClaude2uiCatalog } from '@shared/a2ui-catalog'
import { checkCompositeInstance, getComposite } from '@shared/a2ui-composites'

const catalogs = [buildClaude2uiCatalog(), basicCatalog]
const knownComponents = new Map(catalogs.map((c) => [c.id, new Set(c.components.keys())]))

/** Komponenten, deren Typ im Katalog nicht existiert (die Bibliothek lässt sie als Platzhalter stehen). */
function unknownComponents(m: A2uiMessage, surfaceCatalog: string | undefined): string[] {
  const list = m.createSurface?.components ?? m.updateComponents?.components
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const c of list) {
    const catId = c?.['@catalogId'] ?? surfaceCatalog
    const names = knownComponents.get(catId)
    if (!names) out.push(`Komponente „${c?.id}“: unbekannter Katalog „${catId}“.`)
    else if (!names.has(c?.component)) {
      out.push(`Komponente „${c?.id}“: Typ „${c?.component}“ gibt es nicht. Verfügbar: ${[...names].join(', ')}.`)
    }
  }
  return out
}
import { danglingRefs, normalizeMessage, surfaceIdOf, type A2uiMessage } from '@shared/a2ui'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  /** Surfaces, die durch den Aufruf neu entstehen bzw. geändert werden. */
  created: string[]
  updated: string[]
}

/**
 * Prüft neue A2UI-Nachrichten gegen den Basic Catalog – im Kontext aller bisher angenommenen
 * Nachrichten (damit Updates auf bestehende Surfaces korrekt geprüft werden).
 * Ein frischer Processor pro Aufruf: abgelehnte Nachrichten hinterlassen keinen Zustand.
 */
export function validate(historyRaw: A2uiMessage[], incomingRaw: A2uiMessage[]): ValidationResult {
  const history = historyRaw.map(normalizeMessage)
  // Eigene Komponenten vor dem Auflösen prüfen – so beziehen sich Fehler auf die Instanz.
  const compositeErrors: string[] = []
  incomingRaw.forEach((m, i) => {
    const list = m?.createSurface?.components ?? m?.updateComponents?.components
    if (!Array.isArray(list)) return
    for (const c of list) {
      const def = c && typeof c === 'object' ? getComposite(c.component) : undefined
      if (def) compositeErrors.push(...checkCompositeInstance(c, def).map((e) => `Nachricht ${i + 1}: ${e}`))
    }
  })
  if (compositeErrors.length) return { ok: false, errors: compositeErrors, created: [], updated: [] }
  const incoming = incomingRaw.map(normalizeMessage)
  const errors: string[] = []
  const p = new MessageProcessor(catalogs as never, undefined, {
    errorHandler: (e: any) => errors.push(e?.error?.message ?? JSON.stringify(e))
  })
  for (const m of history) {
    try {
      p.processMessages([m] as never)
    } catch {
      /* Verlauf war bereits angenommen; Fehler hier ignorieren */
    }
  }
  errors.length = 0

  const known = new Set(p.model.surfacesMap.keys())
  // Katalog je Surface (aus dem Verlauf), um updateComponents gegen den richtigen Katalog zu prüfen.
  const surfaceCatalogs = new Map<string, string>()
  for (const m of history) if (m.createSurface) surfaceCatalogs.set(m.createSurface.surfaceId, m.createSurface.catalogId)
  const created: string[] = []
  const updated: string[] = []
  if (incoming.length === 0) errors.push('`messages` ist leer oder kein Array von A2UI-Nachrichten.')

  incoming.forEach((m, i) => {
    const sid = surfaceIdOf(m)
    const kind = Object.keys(m).find((k) => k !== 'version') ?? '?'
    const where = `Nachricht ${i + 1} (${kind}${sid ? `, Surface „${sid}“` : ''})`
    if (!sid) {
      errors.push(`${where}: keine surfaceId bzw. unbekannter Nachrichtentyp.`)
      return
    }
    if (m.createSurface && known.has(sid)) {
      errors.push(`${where}: Surface existiert schon. Für Änderungen updateComponents/updateDataModel verwenden.`)
      return
    }
    if (!m.createSurface && !known.has(sid)) {
      errors.push(`${where}: Surface existiert nicht. Zuerst createSurface senden.`)
      return
    }
    const surfaceCatalog = m.createSurface?.catalogId ?? (p.model.surfacesMap.get(sid) as any)?.catalogId ?? surfaceCatalogs.get(sid)
    const unknown = unknownComponents(m, surfaceCatalog)
    if (unknown.length) {
      for (const u of unknown) errors.push(`${where}: ${u}`)
      return
    }
    if (m.createSurface) surfaceCatalogs.set(sid, m.createSurface.catalogId)
    const before = errors.length
    try {
      p.processMessages([m] as never)
    } catch (e) {
      if (errors.length === before) errors.push((e as Error).message)
    }
    if (errors.length > before) {
      errors[errors.length - 1] = `${where}: ${errors[errors.length - 1]}`
      return
    }
    if (m.createSurface) {
      known.add(sid)
      created.push(sid)
    } else if (m.deleteSurface) {
      known.delete(sid)
    } else if (!created.includes(sid) && !updated.includes(sid)) {
      updated.push(sid)
    }
  })

  // Strukturprüfung der betroffenen Surfaces: root vorhanden, keine hängenden Verweise.
  if (errors.length === 0) {
    for (const sid of [...created, ...updated]) {
      const s: any = p.model.surfacesMap.get(sid)
      const comps: Map<string, any> | undefined = s?.componentsModel?.components
      if (!comps) continue
      if (!comps.has('root')) errors.push(`Surface „${sid}“: keine Komponente mit "id": "root".`)
      for (const d of danglingRefs(comps)) errors.push(`Surface „${sid}“: ${d}.`)
    }
  }
  p.dispose()
  return { ok: errors.length === 0, errors, created, updated }
}
