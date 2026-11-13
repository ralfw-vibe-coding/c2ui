import { describe, expect, it } from 'vitest'
import { adoptMessage, answerAfter, fillPrompt, isLastTurn, promptOr, transcriptExcerpt } from './merge'
import { DEFAULT_MERGE, migrateSettings, type Transcript } from './types'

const t: Transcript = [
  { type: 'notice', id: 'n', text: 'Abgezweigt' },
  { type: 'user', id: 'u1', text: 'Welche Quellen?', ts: 1 },
  { type: 'assistant', id: 'a1', blocks: [{ type: 'text', text: 'Ich schaue nach …' }, { type: 'tool_use', id: 't', name: 'x', input: {} }] },
  { type: 'assistant', id: 'a1b', blocks: [{ type: 'thinking', text: 'hm' }, { type: 'text', text: 'Bundestagsarchiv.' }] },
  { type: 'turn', id: 'e1', durationMs: 1, isError: false },
  { type: 'user', id: 'u2', text: 'Nur deutsch', ts: 2 },
  { type: 'assistant', id: 'a2', blocks: [{ type: 'text', text: 'Dann nur PDF.' }] },
  { type: 'user', id: 's', text: 'schneller', ts: 3, steer: true },
  { type: 'assistant', id: 'a2b', blocks: [{ type: 'text', text: 'Kurz: PDF.' }] },
  { type: 'user', id: 'u3', text: 'Danke', ts: 4 },
  { type: 'assistant', id: 'a3', blocks: [{ type: 'text', text: 'Gern.' }] }
]

describe('Zusammenführen', () => {
  it('setzt Platzhalter ein und fällt auf den Standard zurück', () => {
    expect(fillPrompt('{Titel} → {Ziel}, {Titel}', { source: 'B', target: 'A' })).toBe('B → A, B')
    expect(promptOr('  ', 'std')).toBe('std')
    expect(promptOr(' eigen ', 'std')).toBe('eigen')
  })

  it('nimmt die abschließende Antwort eines Turns (Zwischenrufe gehören dazu)', () => {
    expect(answerAfter(t, 'u1')).toBe('Bundestagsarchiv.')
    expect(answerAfter(t, 'u2')).toBe('Kurz: PDF.')
    expect(answerAfter(t, 'fehlt')).toBe('')
  })

  it('erkennt den letzten Turn', () => {
    expect(isLastTurn(t, 'u3')).toBe(true)
    expect(isLastTurn(t, 'u2')).toBe(false)
    expect(isLastTurn(t)).toBe(true)
  })

  it('zieht den Verlauf bis zu einer Nachricht heraus', () => {
    expect(transcriptExcerpt(t, 'u2')).toBe('**Frage:** Welche Quellen?\n\n**Antwort:** Bundestagsarchiv.\n\n**Frage:** Nur deutsch\n\n**Antwort:** Kurz: PDF.')
    expect(transcriptExcerpt(t).split('**Frage:**').length - 1).toBe(3)
  })

  it('baut die Nachricht an A', () => {
    expect(adoptMessage('Nimm das auf.', 'Quellen', ' Ergebnis ')).toBe('Nimm das auf.\n\n---\nAus dem Nebengespräch „Quellen“:\n\nErgebnis')
  })

  it('Einstellungen: Standard-Prompts, eigene bleiben, leere fallen zurück', () => {
    expect(migrateSettings({}).merge).toEqual(DEFAULT_MERGE)
    const s = migrateSettings({ merge: { prepare: 'P', adopt: '  ', preview: false } })
    expect(s.merge).toEqual({ prepare: 'P', adopt: DEFAULT_MERGE.adopt, preview: false })
  })
})
