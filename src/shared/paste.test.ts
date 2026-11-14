import { describe, expect, it } from 'vitest'
import { countLines, DEFAULT_PASTE, pasteSummary, pasteTooBig } from './paste'

const zeilen = (n: number): string => Array.from({ length: n }, (_, i) => `Zeile ${i + 1}`).join('\n')

describe('Große Einfügungen', () => {
  it('lässt normale Prompts in Ruhe', () => {
    expect(pasteTooBig('Mach bitte weiter.')).toBe(false)
    // Ein sorgfältiger Prompt mit Zitat ist schnell 900 Zeichen lang – der bleibt im Feld.
    expect(pasteTooBig('x'.repeat(900))).toBe(false)
    expect(pasteTooBig(zeilen(12))).toBe(false)
    expect(pasteTooBig('')).toBe(false)
  })

  it('hängt an, sobald eines der beiden Maße reißt', () => {
    expect(pasteTooBig(zeilen(21))).toBe(true)
    // Viele kurze Zeilen: wenige Zeichen, aber der halbe Bildschirm.
    expect(pasteTooBig(Array.from({ length: 40 }, () => 'a').join('\n'))).toBe(true)
    // Eine einzige sehr lange Zeile (minifiziertes JSON) hat nur eine Zeile.
    expect(pasteTooBig('x'.repeat(2001))).toBe(true)
    expect(pasteTooBig('x'.repeat(2000))).toBe(false)
  })

  it('lässt sich abschalten: 0 heißt „dieses Maß zählt nicht“', () => {
    // 500 kurze Zeilen: viele Zeilen, aber unter 2000 Zeichen.
    const vieleKurze = Array.from({ length: 500 }, () => 'a').join('\n')
    expect(pasteTooBig(vieleKurze, { lines: 0, chars: 2000 })).toBe(false)
    expect(pasteTooBig(vieleKurze, DEFAULT_PASTE)).toBe(true)
    expect(pasteTooBig('x'.repeat(50_000), { lines: 20, chars: 0 })).toBe(false)
    expect(pasteTooBig(zeilen(500), { lines: 0, chars: 0 })).toBe(false)
  })

  it('zählt Zeilen unabhängig vom Zeilenende', () => {
    expect(countLines('a\nb\r\nc\rd')).toBe(4)
    expect(countLines('')).toBe(0)
  })

  it('beschreibt die Einfügung knapp', () => {
    expect(pasteSummary('Erste Zeile\nzweite')).toBe('2 Zeilen, 18 Zeichen: „Erste Zeile“')
    expect(pasteSummary('x'.repeat(80))).toBe(`1 Zeile, 80 Zeichen: „${'x'.repeat(57)}…“`)
  })
})
