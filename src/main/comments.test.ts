import { describe, expect, it } from 'vitest'
import { addComment, cleanComments, removeComment, updateComment } from './comments'

describe('Notizen zu Stellen im Verlauf', () => {
  const t0 = 1000
  const list = addComment([], { id: 'k1', itemId: 'a1', quote: '  Bundestagsarchiv  ', text: '  nachprüfen ' }, t0)

  it('legt eine Notiz mit Zitat und Zeiten an', () => {
    expect(list).toEqual([{ id: 'k1', itemId: 'a1', quote: 'Bundestagsarchiv', text: 'nachprüfen', createdAt: t0, updatedAt: t0 }])
    expect(addComment([], { id: 'k2', itemId: 'a1', text: 'ohne Zitat' })[0].quote).toBeUndefined()
    expect(addComment([], { id: 'k3', itemId: 'a1', quote: 'x'.repeat(400), text: 'lang' })[0].quote?.length).toBe(300)
  })

  it('ändert und löscht', () => {
    expect(updateComment(list, 'k1', ' anders ', t0 + 5)).toEqual([{ ...list[0], text: 'anders', updatedAt: t0 + 5 }])
    expect(updateComment(list, 'k1', '   ')).toEqual([])
    expect(updateComment(list, 'fremd', 'x')).toEqual(list)
    expect(removeComment(list, 'k1')).toEqual([])
  })

  it('räumt Gelesenes auf', () => {
    expect(cleanComments([...list, { id: 'leer', itemId: 'a1', text: '  ' }, null, { id: 5 }])).toEqual(list)
    expect(cleanComments('kaputt')).toEqual([])
  })
})
