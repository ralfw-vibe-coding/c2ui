import { isA2uiCall } from './a2ui'
import type { Block, Transcript, TranscriptItem } from './types'

/** Einheit der Chat-Darstellung. */
export type Unit =
  | { kind: 'item'; key: string; item: TranscriptItem }
  | { kind: 'block'; key: string; block: Block }
  | { kind: 'steps'; key: string; blocks: { key: string; block: Block }[]; lastTurn: boolean }

/**
 * Teilt ein Transkript in Darstellungs-Einheiten. Pro Turn (von einer Nutzernachricht bis zur
 * nächsten) gelten als „Arbeitsschritte“: Werkzeugaufrufe, Gedanken und Zwischentexte vor dem
 * letzten Werkzeugaufruf. Aufeinanderfolgende Schritte werden zu einer einklappbaren Gruppe.
 * Immer sichtbar: Antworttext nach dem letzten Werkzeug, A2UI-Screens, Bilder, Fehler, Hinweise.
 * Mit `collapse = false` bleibt alles einzeln sichtbar (wie früher).
 */
export function toUnits(t: Transcript, collapse = true): Unit[] {
  // Index des letzten Turns (letzte Nutzernachricht) – dort kann noch gearbeitet werden.
  let lastUserIdx = -1
  t.forEach((it, i) => it.type === 'user' && (lastUserIdx = i))

  const units: Unit[] = []
  let i = 0
  while (i < t.length) {
    const item = t[i]
    if (item.type === 'user') {
      units.push({ kind: 'item', key: item.id, item })
      i++
      continue
    }
    // Segment bis zur nächsten Nutzernachricht
    const start = i
    while (i < t.length && t[i].type !== 'user') i++
    const segment = t.slice(start, i)
    units.push(...segmentUnits(segment, collapse, start > lastUserIdx))
  }
  return units
}

function isStepBlock(b: Block): boolean {
  return (b.type === 'tool_use' && !isA2uiCall(b)) || b.type === 'thinking'
}

function segmentUnits(segment: TranscriptItem[], collapse: boolean, lastTurn: boolean): Unit[] {
  // Alle Blöcke des Segments in Reihenfolge, mit Position, um den letzten Schritt zu finden.
  const flat: { key: string; block: Block }[] = []
  for (const it of segment) {
    if (it.type === 'assistant') it.blocks.forEach((b, j) => flat.push({ key: `${it.id}:${j}`, block: b }))
  }
  let lastStep = -1
  flat.forEach((f, j) => isStepBlock(f.block) && (lastStep = j))
  const stepKeys = new Set<string>()
  if (collapse) {
    flat.forEach((f, j) => {
      const b = f.block
      if (isStepBlock(b)) stepKeys.add(f.key)
      else if (b.type === 'text' && j < lastStep) stepKeys.add(f.key) // Zwischentext vor dem letzten Werkzeug
    })
  }

  const units: Unit[] = []
  let group: { key: string; block: Block }[] | null = null
  const flush = (): void => {
    if (group?.length) units.push({ kind: 'steps', key: 'steps:' + group[0].key, blocks: group, lastTurn })
    group = null
  }
  for (const it of segment) {
    if (it.type !== 'assistant') {
      // Fehler/Hinweise/Turn-Fußzeile unterbrechen keine Schrittgruppe optisch nötig – aber sie bleiben sichtbar.
      flush()
      units.push({ kind: 'item', key: it.id, item: it })
      continue
    }
    it.blocks.forEach((b, j) => {
      const key = `${it.id}:${j}`
      if (stepKeys.has(key)) {
        if (b.type === 'text' && !b.text.trim()) return
        if (b.type === 'thinking' && !b.text.trim()) return
        ;(group ??= []).push({ key, block: b })
      } else {
        flush()
        units.push({ kind: 'block', key, block: b })
      }
    })
  }
  flush()
  return units
}

/** Kurzer Name eines Werkzeugs für die Zusammenfassung (mcp__a2ui__describe_components → describe_components). */
export function shortToolName(name: string): string {
  return name.startsWith('mcp__') ? name.slice(name.lastIndexOf('__') + 2) : name
}
