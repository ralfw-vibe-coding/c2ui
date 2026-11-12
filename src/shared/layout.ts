import type { LayoutNode, LayoutState } from './types'

// Reine Funktionen auf dem Split-Baum. Jede Funktion liefert einen neuen Baum.

type Leaf = LayoutNode & { type: 'leaf' }
type Split = LayoutNode & { type: 'split' }
export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom'

let counter = 0
export function newId(prefix = 'c'): string {
  counter = (counter + 1) % 1e6
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function leaf(chatId: string | null = null): Leaf {
  return { type: 'leaf', id: newId('cell'), chatId }
}

export function emptyLayout(): LayoutState {
  const l = leaf()
  return { root: l, selectedCellId: l.id }
}

export function leaves(n: LayoutNode): Leaf[] {
  return n.type === 'leaf' ? [n] : n.children.flatMap(leaves)
}

export function findLeaf(n: LayoutNode, cellId: string): Leaf | undefined {
  return leaves(n).find((l) => l.id === cellId)
}

export function findCellOfChat(n: LayoutNode, chatId: string): Leaf | undefined {
  return leaves(n).find((l) => l.chatId === chatId)
}

function mapNodes(n: LayoutNode, f: (n: LayoutNode) => LayoutNode): LayoutNode {
  const m = f(n)
  if (m.type === 'split') return { ...m, children: m.children.map((c) => mapNodes(c, f)) }
  return m
}

/** Setzt einen Chat in eine Zelle. Ein Chat ist höchstens in einer Zelle offen. */
export function setChat(root: LayoutNode, cellId: string, chatId: string | null): LayoutNode {
  return mapNodes(root, (n) => {
    if (n.type !== 'leaf') return n
    if (n.id === cellId) return { ...n, chatId }
    if (chatId && n.chatId === chatId) return { ...n, chatId: null }
    return n
  })
}

/** Teilt eine Zelle; die neue Zelle kommt vor oder hinter die bestehende. */
export function splitCell(
  root: LayoutNode,
  cellId: string,
  direction: 'row' | 'column',
  position: 'before' | 'after',
  newLeaf: Leaf = leaf()
): LayoutNode {
  const parent = findParent(root, cellId)
  if (parent && parent.direction === direction) {
    const i = parent.children.findIndex((c) => c.id === cellId)
    const half = parent.sizes[i] / 2
    const children = [...parent.children]
    const sizes = [...parent.sizes]
    const at = position === 'before' ? i : i + 1
    children.splice(at, 0, newLeaf)
    sizes.splice(i, 1, half)
    sizes.splice(at, 0, half)
    return replaceNode(root, parent.id, { ...parent, children, sizes })
  }
  const target = findLeaf(root, cellId)
  if (!target) return root
  const pair = position === 'before' ? [newLeaf, target] : [target, newLeaf]
  return replaceNode(root, cellId, { type: 'split', id: newId('split'), direction, children: pair, sizes: [50, 50] })
}

/** Entfernt eine Zelle; Geschwister füllen den Platz. Die letzte Zelle bleibt (leer) erhalten. */
export function removeCell(root: LayoutNode, cellId: string): LayoutNode {
  if (root.type === 'leaf') return root.id === cellId ? leaf() : root
  const result = removeRec(root, cellId)
  return result ?? leaf()
}

function removeRec(n: LayoutNode, cellId: string): LayoutNode | null {
  if (n.type === 'leaf') return n.id === cellId ? null : n
  const children: LayoutNode[] = []
  const sizes: number[] = []
  let removed = 0
  n.children.forEach((c, i) => {
    const r = removeRec(c, cellId)
    if (r) {
      children.push(r)
      sizes.push(n.sizes[i])
    } else removed += n.sizes[i]
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  if (removed > 0) {
    const total = sizes.reduce((a, b) => a + b, 0)
    for (let i = 0; i < sizes.length; i++) sizes[i] = (sizes[i] / total) * 100
  }
  return normalize({ ...n, children, sizes })
}

/** Verschachtelte Splits gleicher Richtung werden zusammengelegt. */
function normalize(s: Split): Split {
  const children: LayoutNode[] = []
  const sizes: number[] = []
  s.children.forEach((c, i) => {
    if (c.type === 'split' && c.direction === s.direction) {
      c.children.forEach((cc, j) => {
        children.push(cc)
        sizes.push((s.sizes[i] * c.sizes[j]) / 100)
      })
    } else {
      children.push(c)
      sizes.push(s.sizes[i])
    }
  })
  return { ...s, children, sizes }
}

export function setSizes(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  return mapNodes(root, (n) => (n.type === 'split' && n.id === splitId ? { ...n, sizes } : n))
}

export function findParent(root: LayoutNode, id: string): Split | undefined {
  if (root.type === 'leaf') return undefined
  for (const c of root.children) {
    if (c.id === id) return root
    const p = findParent(c, id)
    if (p) return p
  }
  return undefined
}

function replaceNode(root: LayoutNode, id: string, repl: LayoutNode): LayoutNode {
  if (root.id === id) return repl
  if (root.type === 'leaf') return root
  return { ...root, children: root.children.map((c) => replaceNode(c, id, repl)) }
}

/**
 * Legt einen Chat per Drag&Drop auf eine Zielzelle.
 * - center: Chat kommt in die Zielzelle. Kam er aus einer anderen Zelle, wird getauscht.
 * - Rand: Zielzelle wird geteilt, der Chat kommt in die neue Zelle. Die Herkunftszelle
 *   (falls vorhanden) verschwindet, damit ein Verschieben die Zellenzahl nicht ändert.
 * Liefert den neuen Baum und die ID der Zelle, in der der Chat jetzt liegt.
 */
export function dropChat(
  root: LayoutNode,
  chatId: string,
  targetCellId: string,
  zone: DropZone
): { root: LayoutNode; cellId: string } {
  const source = findCellOfChat(root, chatId)
  const target = findLeaf(root, targetCellId)
  if (!target) return { root, cellId: source?.id ?? targetCellId }
  if (source && source.id === target.id) return { root, cellId: target.id }

  if (zone === 'center') {
    let r = root
    if (source) r = setChat(r, source.id, target.chatId)
    r = mapNodes(r, (n) => (n.type === 'leaf' && n.id === target.id ? { ...n, chatId } : n))
    return { root: r, cellId: target.id }
  }

  const direction = zone === 'left' || zone === 'right' ? 'row' : 'column'
  const position = zone === 'left' || zone === 'top' ? 'before' : 'after'
  const nl = leaf(chatId)
  let r = splitCell(root, target.id, direction, position, nl)
  if (source) r = removeCell(r, source.id)
  return { root: r, cellId: nl.id }
}

/** Stellt sicher, dass ein geladenes Layout konsistent ist. */
export function sanitize(state: LayoutState | null | undefined, knownChatIds: Set<string>): LayoutState {
  if (!state || !state.root) return emptyLayout()
  const seen = new Set<string>()
  const root = mapNodes(state.root, (n) => {
    if (n.type !== 'leaf') return n
    if (n.chatId && (!knownChatIds.has(n.chatId) || seen.has(n.chatId))) return { ...n, chatId: null }
    if (n.chatId) seen.add(n.chatId)
    return n
  })
  const ls = leaves(root)
  const selectedCellId = ls.some((l) => l.id === state.selectedCellId) ? state.selectedCellId : ls[0].id
  return { root, selectedCellId }
}
