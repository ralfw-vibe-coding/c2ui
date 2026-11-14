import type { AgentEvent, Block, Transcript, TranscriptItem } from './types'

/**
 * Wendet ein Agent-Event auf ein Transkript an und liefert ein neues Transkript.
 * Wird im Main-Prozess (Persistenz) und im Renderer (Anzeige) identisch genutzt.
 */
export function applyEvent(t: Transcript, e: AgentEvent): Transcript {
  // Einmal angewandt genügt: Ein frisch geladenes Transkript enthält das Ereignis u. U. schon
  // (der Renderer lädt es, während das Ereignis noch unterwegs ist).
  if ('id' in e && (e.kind === 'user' || e.kind === 'notice' || e.kind === 'error') && t.some((i) => i.id === e.id)) return t
  switch (e.kind) {
    case 'user':
      return [...t, { type: 'user', id: e.id, text: e.text, ts: e.ts, ...(e.attachments?.length ? { attachments: e.attachments } : {}), ...(e.steer ? { steer: true } : {}), ...(e.merge ? { merge: e.merge } : {}) }]

    case 'text-delta': {
      const idx = findAssistant(t, e.msgId)
      const item: TranscriptItem & { type: 'assistant' } =
        idx >= 0 ? (t[idx] as TranscriptItem & { type: 'assistant' }) : { type: 'assistant', id: e.msgId, blocks: [] }
      const blocks = [...item.blocks]
      const existing = blocks[e.index]
      if (existing && (existing.type === 'text' || existing.type === 'thinking')) {
        blocks[e.index] = { ...existing, text: existing.text + e.text }
      } else {
        while (blocks.length < e.index) blocks.push({ type: 'text', text: '' })
        blocks[e.index] = { type: e.blockType, text: e.text }
      }
      return replaceOrAppend(t, idx, { ...item, blocks })
    }

    case 'assistant': {
      const idx = findAssistant(t, e.msgId)
      const blocks: Block[] = idx >= 0 ? [...(t[idx] as TranscriptItem & { type: 'assistant' }).blocks] : []
      e.blocks.forEach((b, k) => {
        const pos = e.index === undefined ? -1 : e.index + k
        if (b.type === 'tool_use') {
          const dup = blocks.findIndex((x) => x.type === 'tool_use' && x.id === b.id)
          if (dup >= 0) {
            blocks[dup] = { ...b, result: (blocks[dup] as typeof b).result }
            return
          }
        }
        if (pos < 0) blocks.push(b)
        else {
          while (blocks.length < pos) blocks.push({ type: 'text', text: '' })
          blocks[pos] = b
        }
      })
      return replaceOrAppend(t, idx, { type: 'assistant', id: e.msgId, blocks })
    }

    case 'tool-result': {
      for (let i = t.length - 1; i >= 0; i--) {
        const item = t[i]
        if (item.type !== 'assistant') continue
        const bi = item.blocks.findIndex((b) => b.type === 'tool_use' && b.id === e.toolUseId)
        if (bi < 0) continue
        const blocks = [...item.blocks]
        const b = blocks[bi] as Block & { type: 'tool_use' }
        blocks[bi] = { ...b, result: { content: e.content, isError: e.isError } }
        const next = [...t]
        next[i] = { ...item, blocks }
        return next
      }
      return t
    }

    case 'turn-end': {
      const next: Transcript = [...t]
      if (e.isError && e.errorText) next.push({ type: 'error', id: e.id + '-err', text: e.errorText })
      let costUsd = e.costUsd
      if (e.costTotalUsd !== undefined) {
        // Claude meldet die Summe der Session (auch über --resume hinweg) → Differenz zum letzten Turn.
        const prev = [...t].reverse().find((i) => i.type === 'turn' && i.costTotalUsd !== undefined) as
          | { costTotalUsd?: number }
          | undefined
        const p = prev?.costTotalUsd
        costUsd = p !== undefined && e.costTotalUsd >= p ? e.costTotalUsd - p : e.costTotalUsd
      }
      next.push({
        type: 'turn',
        id: e.id,
        durationMs: e.durationMs,
        costUsd,
        costTotalUsd: e.costTotalUsd,
        isError: e.isError,
        model: e.model
      })
      return next
    }

    case 'error':
      return [...t, { type: 'error', id: e.id, text: e.text }]

    case 'notice':
      return [...t, { type: 'notice', id: e.id, text: e.text }]

    case 'session':
    case 'context':
      return t
  }
}

function findAssistant(t: Transcript, msgId: string): number {
  for (let i = t.length - 1; i >= 0; i--) {
    const item = t[i]
    if (item.type === 'assistant' && item.id === msgId) return i
  }
  return -1
}

function replaceOrAppend(t: Transcript, idx: number, item: TranscriptItem): Transcript {
  if (idx < 0) return [...t, item]
  const next = [...t]
  next[idx] = item
  return next
}
