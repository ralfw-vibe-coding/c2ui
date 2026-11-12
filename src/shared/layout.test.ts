import { describe, expect, it } from 'vitest'
import { dropChat, emptyLayout, findCellOfChat, leaves, removeCell, sanitize, setChat, splitCell } from './layout'
import type { LayoutNode } from './types'

const shape = (n: LayoutNode): unknown =>
  n.type === 'leaf' ? n.chatId ?? '_' : { [n.direction]: n.children.map(shape), sizes: n.sizes.map(Math.round) }

describe('layout', () => {
  it('teilt eine Zelle und fügt Geschwister in gleicher Richtung ein', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = setChat(root, a, 'A')
    r = splitCell(r, a, 'row', 'after')
    r = splitCell(r, a, 'row', 'after')
    expect(shape(r)).toEqual({ row: ['A', '_', '_'], sizes: [25, 25, 50] })
  })

  it('verschachtelt Splits unterschiedlicher Richtung', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = splitCell(setChat(root, a, 'A'), a, 'row', 'after')
    r = splitCell(r, a, 'column', 'after')
    expect(shape(r)).toEqual({ row: [{ column: ['A', '_'], sizes: [50, 50] }, '_'], sizes: [50, 50] })
  })

  it('entfernt eine Zelle, Geschwister füllen den Platz, Ebenen werden flach', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = splitCell(setChat(root, a, 'A'), a, 'row', 'after')
    const b = leaves(r)[1].id
    r = setChat(r, b, 'B')
    r = splitCell(r, b, 'column', 'after')
    const c = leaves(r)[2].id
    r = setChat(r, c, 'C')
    r = removeCell(r, b)
    expect(shape(r)).toEqual({ row: ['A', 'C'], sizes: [50, 50] })
    r = removeCell(r, a)
    expect(shape(r)).toBe('C')
    r = removeCell(r, leaves(r)[0].id)
    expect(shape(r)).toBe('_')
  })

  it('ein Chat ist nur in einer Zelle offen', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = splitCell(setChat(root, a, 'A'), a, 'row', 'after')
    r = setChat(r, leaves(r)[1].id, 'A')
    expect(shape(r)).toEqual({ row: ['_', 'A'], sizes: [50, 50] })
  })

  it('Drop in die Mitte tauscht, Drop an den Rand verschiebt ohne Zellenzuwachs', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = splitCell(setChat(root, a, 'A'), a, 'row', 'after')
    const b = leaves(r)[1].id
    r = setChat(r, b, 'B')
    r = dropChat(r, 'A', b, 'center').root
    expect(shape(r)).toEqual({ row: ['B', 'A'], sizes: [50, 50] })
    const res = dropChat(r, 'B', findCellOfChat(r, 'A')!.id, 'bottom')
    expect(shape(res.root)).toEqual({ column: ['A', 'B'], sizes: [50, 50] })
    expect(findCellOfChat(res.root, 'B')!.id).toBe(res.cellId)
  })

  it('Drop eines neuen Chats (aus der Sidebar) an den Rand erzeugt eine Zelle', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    const r = dropChat(setChat(root, a, 'A'), 'X', a, 'left').root
    expect(shape(r)).toEqual({ row: ['X', 'A'], sizes: [50, 50] })
  })

  it('sanitize entfernt unbekannte und doppelte Chats', () => {
    const { root } = emptyLayout()
    const a = leaves(root)[0].id
    let r = splitCell(setChat(root, a, 'A'), a, 'row', 'after')
    r = { ...r, children: (r as any).children.map((c: any) => ({ ...c, chatId: 'A' })) } as LayoutNode
    const s = sanitize({ root: r, selectedCellId: 'gibtsnicht' }, new Set(['A']))
    expect(shape(s.root)).toEqual({ row: ['A', '_'], sizes: [50, 50] })
    expect(s.selectedCellId).toBe(leaves(s.root)[0].id)
  })
})
