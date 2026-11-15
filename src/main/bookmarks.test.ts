import { describe, expect, it } from 'vitest'
import { addBookmark, cleanBookmarks, labelBookmark, removeBookmark } from './bookmarks'

describe('Lesezeichen', () => {
  const eins = addBookmark([], { id: 'a', itemId: 'i1', quote: '  Ein Absatz  ' }, 100)

  it('legt eines an, mit gekürztem Zitat und ohne leere Felder', () => {
    expect(eins).toEqual([{ id: 'a', itemId: 'i1', quote: 'Ein Absatz', createdAt: 100 }])
    expect(addBookmark([], { id: 'b', itemId: 'i2' }, 1)[0]).toEqual({ id: 'b', itemId: 'i2', createdAt: 1 })
    expect(addBookmark([], { id: 'c', itemId: 'i3', quote: 'x'.repeat(400) }, 1)[0].quote?.length).toBe(300)
  })

  it('merkt sich, dass die Stelle ein ganzer Absatz ist', () => {
    expect(addBookmark([], { id: 'd', itemId: 'i4', quote: 'Der erste Satz des Absatzes.', block: true }, 5)[0]).toEqual({
      id: 'd',
      itemId: 'i4',
      quote: 'Der erste Satz des Absatzes.',
      block: true,
      createdAt: 5
    })
    // Ohne Zitat gibt es keinen Absatz – dann gilt der ganze Eintrag.
    expect(addBookmark([], { id: 'e', itemId: 'i5', block: true }, 5)[0].block).toBeUndefined()
  })

  it('beschriftet, benennt um und nimmt die Beschriftung wieder weg', () => {
    const mitLabel = labelBookmark(eins, 'a', '  Kapitel 2  ')
    expect(mitLabel[0].label).toBe('Kapitel 2')
    expect(labelBookmark(mitLabel, 'a', '   ')[0].label).toBeUndefined()
    expect(labelBookmark(eins, 'weg', 'x')).toEqual(eins)
  })

  it('löscht und sortiert Kaputtes aus', () => {
    expect(removeBookmark(eins, 'a')).toEqual([])
    expect(cleanBookmarks([{ id: 'a', itemId: 'i' }, { id: 'a', itemId: 'i' }, { itemId: 'ohne id' }, null, 'x'])).toEqual([
      { id: 'a', itemId: 'i' }
    ])
    expect(cleanBookmarks('nichts')).toEqual([])
  })
})
