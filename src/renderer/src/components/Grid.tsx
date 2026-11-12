import { Fragment, useRef } from 'react'
import * as L from '@shared/layout'
import type { LayoutNode } from '@shared/types'
import { useStore } from '../store'
import { Cell } from './Cell'

const MIN_PERCENT = 8

export function Grid() {
  const root = useStore((s) => s.layout.root)
  return (
    <div className="grid-root">
      <NodeView node={root} />
    </div>
  )
}

function NodeView({ node }: { node: LayoutNode }) {
  if (node.type === 'leaf') return <Cell cellId={node.id} chatId={node.chatId} />
  return <SplitView node={node} />
}

function SplitView({ node }: { node: LayoutNode & { type: 'split' } }) {
  const ref = useRef<HTMLDivElement>(null)

  function startResize(i: number, ev: React.PointerEvent<HTMLDivElement>): void {
    const el = ref.current
    if (!el) return
    ev.preventDefault()
    const handle = ev.currentTarget
    handle.setPointerCapture(ev.pointerId)
    const rect = el.getBoundingClientRect()
    const total = node.direction === 'row' ? rect.width : rect.height
    const start = node.direction === 'row' ? ev.clientX : ev.clientY
    const sizes = [...node.sizes]
    const pair = sizes[i] + sizes[i + 1]
    document.body.classList.add(node.direction === 'row' ? 'resizing-col' : 'resizing-row')

    const move = (e: PointerEvent): void => {
      const pos = node.direction === 'row' ? e.clientX : e.clientY
      const delta = ((pos - start) / total) * 100
      const a = Math.min(Math.max(sizes[i] + delta, MIN_PERCENT), pair - MIN_PERCENT)
      const next = [...sizes]
      next[i] = a
      next[i + 1] = pair - a
      const st = useStore.getState()
      st.setLayout({ ...st.layout, root: L.setSizes(st.layout.root, node.id, next) }, false)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing-col', 'resizing-row')
      const st = useStore.getState()
      st.setLayout(st.layout, true)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return (
    <div ref={ref} className={`split split-${node.direction}`}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <div
              className={`divider divider-${node.direction}`}
              onPointerDown={(e) => startResize(i - 1, e)}
              role="separator"
              aria-orientation={node.direction === 'row' ? 'vertical' : 'horizontal'}
            />
          )}
          <div className="split-child" style={{ flex: `${node.sizes[i]} 1 0px` }}>
            <NodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  )
}
