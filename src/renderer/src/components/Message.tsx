import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Block, TranscriptItem } from '@shared/types'
import { Icon } from './Icon'

export const TranscriptItemView = memo(function TranscriptItemView({ item }: { item: TranscriptItem }) {
  switch (item.type) {
    case 'user':
      return (
        <div className="msg msg-user">
          <div className="bubble">{item.text}</div>
        </div>
      )
    case 'assistant':
      return (
        <div className="msg msg-assistant">
          {item.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )
    case 'error':
      return (
        <div className="msg msg-error">
          <Icon name="alert" /> <span>{item.text}</span>
        </div>
      )
    case 'turn':
      return (
        <div className="msg-turn">
          {(item.durationMs / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s
          {item.costUsd !== undefined &&
            ` · ${item.costUsd.toLocaleString('de-DE', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}`}
        </div>
      )
  }
})

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      if (!block.text) return null
      return (
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
        </div>
      )
    case 'thinking':
      if (!block.text.trim()) return null
      return (
        <details className="thinking">
          <summary>Gedanken</summary>
          <div className="thinking-text">{block.text}</div>
        </details>
      )
    case 'tool_use': {
      const status = !block.result ? 'pending' : block.result.isError ? 'error' : 'ok'
      return (
        <details className={`tool tool-${status}`}>
          <summary>
            {status === 'pending' ? <span className="spinner" /> : <Icon name={status === 'ok' ? 'check' : 'alert'} size={14} />}
            <span className="tool-name">{block.name}</span>
            <span className="tool-summary">{toolSummary(block.input)}</span>
          </summary>
          <pre className="tool-input">{JSON.stringify(block.input, null, 2)}</pre>
          {block.result && <pre className="tool-result">{block.result.content}</pre>}
        </details>
      )
    }
  }
}

function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  for (const k of ['description', 'file_path', 'path', 'command', 'pattern', 'url', 'query', 'prompt']) {
    const v = o[k]
    if (typeof v === 'string' && v) return v.length > 120 ? v.slice(0, 117) + '…' : v
  }
  return ''
}
