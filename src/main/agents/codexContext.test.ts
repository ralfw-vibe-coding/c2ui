import { describe, expect, it } from 'vitest'
import { codexContext } from './codex'

describe('Kontextfüllstand aus Codex-Meldungen', () => {
  // Nachricht einer echten Sitzung (codex app-server)
  const echt = {
    threadId: '01a1',
    turnId: '01a2',
    tokenUsage: {
      total: { totalTokens: 40000, inputTokens: 39000, cachedInputTokens: 0, outputTokens: 1000, reasoningOutputTokens: 0 },
      last: { totalTokens: 20476, inputTokens: 20471, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 0 },
      modelContextWindow: 258400
    }
  }

  it('nimmt die letzte Anfrage, nicht die Summe des Threads', () => {
    expect(codexContext(echt)).toEqual({ used: 20476, max: 258400 })
  })

  it('rechnet zusammen, wenn keine Gesamtzahl dabei ist', () => {
    expect(codexContext({ tokenUsage: { last: { inputTokens: 100, outputTokens: 20, reasoningOutputTokens: 5 } } })).toEqual({ used: 125, max: undefined })
  })

  it('kommt mit Unbekanntem klar', () => {
    expect(codexContext(undefined)).toEqual({ max: undefined })
    expect(codexContext({ tokenUsage: { modelContextWindow: 1000 } })).toEqual({ used: undefined, max: 1000 })
  })
})
