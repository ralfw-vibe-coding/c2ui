import { describe, expect, it } from 'vitest'
import { searchChats, snippetOf } from './search'
import type { Chat, ChatComment, Transcript } from '@shared/types'

const chat = (id: string, title: string, updatedAt: number): Chat =>
  ({ id, title, agent: 'claude', cwd: '/w', createdAt: 1, updatedAt, sessionId: id, sessionStarted: true, permissionMode: 'default' }) as Chat

const t: Record<string, Transcript> = {
  a: [
    { type: 'user', id: 'a1', ts: 10, text: 'Welche Quellen gibt es zum Bundestag?' },
    { type: 'assistant', id: 'a2', blocks: [{ type: 'thinking', text: 'Bundestag?' }, { type: 'text', text: 'Das Bundestagsarchiv hat die Protokolle.' }, { type: 'tool_use', id: 't', name: 'x', input: {} }] },
    { type: 'turn', id: 'a3', durationMs: 1, isError: false },
    { type: 'user', id: 'a4', ts: 20, text: 'Und das Archiv in Berlin?' }
  ],
  b: [{ type: 'user', id: 'b1', ts: 5, text: 'Ganz anderes Thema' }],
  c: []
}

describe('Suche über alle Chats', () => {
  const chats = [chat('a', 'Hausarbeit', 30), chat('b', 'Kochen', 40), chat('c', 'Archivbestände', 50)]
  const find = (q: string, o = {}) => searchChats(chats, (id) => t[id] ?? [], q, o)

  it('findet Stellen im Verlauf, neueste Chats zuerst', () => {
    const r = find('archiv')
    expect(r.map((x) => x.chatId)).toEqual(['c', 'a'])
    expect(r[0]).toMatchObject({ inTitle: true, total: 0, hits: [] })
    expect(r[1].hits.map((h) => h.itemId)).toEqual(['a2', 'a4'])
    expect(r[1].hits[0]).toMatchObject({ role: 'assistant', snippet: 'Das Bundestagsarchiv hat die Protokolle.' })
    expect(r[1].hits[1]).toMatchObject({ role: 'user', ts: 20 })
  })

  it('sucht ohne Rücksicht auf Groß- und Kleinschreibung, aber nicht in Werkzeugen oder Gedanken', () => {
    expect(find('BUNDESTAG').map((x) => x.chatId)).toEqual(['a'])
    expect(find('Bundestag')[0].hits.map((h) => h.itemId)).toEqual(['a1', 'a2'])
    expect(find('tool_use')).toEqual([])
  })

  it('begrenzt Chats und Stellen und zählt trotzdem alles', () => {
    const r = find('ar', { maxHits: 1 })
    expect(r.map((x) => x.chatId)).toEqual(['c', 'a'])
    expect(r.every((x) => x.hits.length <= 1)).toBe(true)
    expect(find('ar', { maxChats: 1 }).map((x) => x.chatId)).toEqual(['c'])
    const a = find('bundestag', { maxHits: 1 })[0]
    expect(a).toMatchObject({ total: 2, hits: [{ itemId: 'a1' }] })
  })

  it('sucht erst ab zwei Zeichen', () => {
    expect(find('a')).toEqual([])
    expect(find('ar').length).toBe(2)
    expect(find(' ')).toEqual([])
  })

  it('schneidet den Ausschnitt um den Treffer zu', () => {
    const lang = 'x'.repeat(200) + ' NADEL ' + 'y'.repeat(200)
    const s = snippetOf(lang, 'nadel', 40)
    expect(s.includes('NADEL')).toBe(true)
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true)
    expect(s.length).toBeLessThanOrEqual(44)
    expect(snippetOf('  kurz  und\n klein ', 'und')).toBe('kurz und klein')
  })
  it('findet auch Notizen und zeigt sie als eigene Treffer', () => {
    const notizen: Record<string, ChatComment[]> = {
      b: [{ id: 'k1', itemId: 'b1', quote: 'Thema', text: 'Hier fehlt das Archiv der Kantine', createdAt: 1, updatedAt: 7 }]
    }
    const r = searchChats(chats, (id) => t[id] ?? [], 'archiv', { commentsOf: (id) => notizen[id] ?? [] })
    expect(r.map((x) => x.chatId)).toEqual(['c', 'b', 'a'])
    const kochen = r.find((x) => x.chatId === 'b')!
    expect(kochen).toMatchObject({ inTitle: false, total: 1 })
    expect(kochen.hits[0]).toMatchObject({ role: 'note', itemId: 'b1', ts: 7, snippet: 'Hier fehlt das Archiv der Kantine' })
    // Ohne Notizen bleibt alles wie vorher.
    expect(searchChats(chats, (id) => t[id] ?? [], 'archiv').map((x) => x.chatId)).toEqual(['c', 'a'])
  })
})
