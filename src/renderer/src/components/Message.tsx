import { memo } from 'react'
import type { Block, TranscriptItem } from '@shared/types'
import { A2UI_ACTION_PREFIX, isA2uiCall } from '@shared/a2ui'
import { A2uiBlock, ActionMessage } from '../a2ui/A2uiBlock'
import { Icon } from './Icon'
import { ChatMarkdown, LocalImage } from './LocalImage'
import { SentAttachments } from './Attachments'
import { UserText } from './QuoteRefs'

export const TranscriptItemView = memo(function TranscriptItemView({ item, chatId }: { item: TranscriptItem; chatId: string }) {
  switch (item.type) {
    case 'user':
      if (item.text.startsWith(A2UI_ACTION_PREFIX)) return <ActionMessage text={item.text} />
      if (item.attachments?.length || item.steer) {
        return (
          <div className={`msg msg-user msg-user-col${item.steer ? ' steer' : ''}`}>
            {item.steer && (
              <div className="steer-label" title="Während der Antwort eingeworfen (Steer)">
                <Icon name="steer" size={11} /> Zwischenruf
              </div>
            )}
            {item.attachments?.length ? <SentAttachments attachments={item.attachments} /> : null}
            {item.text && <div className="bubble"><UserText text={item.text} /></div>}
          </div>
        )
      }
      return (
        <div className="msg msg-user">
          <div className="bubble">
            <UserText text={item.text} />
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="msg msg-assistant">
          {item.blocks.map((b, i) => (
            <BlockView key={i} block={b} chatId={chatId} />
          ))}
        </div>
      )
    case 'error':
      return (
        <div className="msg msg-error">
          <Icon name="alert" /> <span>{item.text}</span>
        </div>
      )
    case 'notice':
      return (
        <div className="msg msg-notice">
          <Icon name="info" size={14} /> <span>{item.text}</span>
        </div>
      )
    case 'turn':
      return (
        <div className="msg-turn">
          {(item.durationMs / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s
          {item.costUsd !== undefined &&
            ` · ${item.costUsd.toLocaleString('de-DE', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}`}
          {item.model && ` · ${item.model}`}
        </div>
      )
  }
})

export function BlockView({ block, chatId }: { block: Block; chatId: string }) {
  switch (block.type) {
    case 'text':
      if (!block.text) return null
      return (
        <div className="md">
          <ChatMarkdown chatId={chatId} text={block.text} />
        </div>
      )
    case 'image':
      return <LocalImage chatId={chatId} path={block.path} />
    case 'thinking':
      if (!block.text.trim()) return null
      return (
        <details className="thinking">
          <summary>Gedanken</summary>
          <div className="thinking-text">{block.text}</div>
        </details>
      )
    case 'tool_use': {
      if (isA2uiCall(block)) return <A2uiBlock chatId={chatId} block={block} />
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
