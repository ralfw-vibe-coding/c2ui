import { describe, expect, it } from 'vitest'
import { composeMessage, forkTitle, splitQuotes } from './quotes'

describe('Bezüge auf Antwortteile', () => {
  it('setzt Zitate als Blockzitat vor die Anmerkung, freier Text am Ende', () => {
    const msg = composeMessage(
      [
        { id: '1', quote: 'Absatz drei\n\n\n\nmit Lücke  ', note: 'Ja, so machen wir es.' },
        { id: '2', quote: 'Frage aus Absatz 5?', note: '' }
      ],
      '  Und sonst noch? '
    )
    expect(msg).toBe('> Absatz drei\n>\n> mit Lücke\n\nJa, so machen wir es.\n\n> Frage aus Absatz 5?\n\nUnd sonst noch?')
  })

  it('zerlegt Nachrichten für die Anzeige', () => {
    expect(splitQuotes('> Zitat a\n> Zitat b\n\nAnmerkung\n\nmehr')).toEqual([
      { kind: 'quote', text: 'Zitat a\nZitat b' },
      { kind: 'text', text: 'Anmerkung\n\nmehr' }
    ])
    expect(splitQuotes('nur Text')).toEqual([{ kind: 'text', text: 'nur Text' }])
  })

  it('kurzer Titel aus Anmerkung, sonst Zitat', () => {
    expect(forkTitle({ quote: 'x', note: 'Wie genau?' })).toBe('Wie genau?')
    expect(forkTitle({ quote: 'a'.repeat(80), note: ' ' })).toHaveLength(48)
  })
})
