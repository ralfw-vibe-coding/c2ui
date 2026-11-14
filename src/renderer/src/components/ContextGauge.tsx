import type { Chat } from '@shared/types'

/**
 * Kontextfüllstand eines Chats: schmaler Balken im Zellenkopf, Stand nach dem letzten Turn.
 * Ohne bekannte Fenstergröße steht dort nur die Tokenzahl.
 */
export function ContextGauge({ chat }: { chat: Chat }) {
  const c = chat.context
  if (!c?.used) return null
  const share = c.max ? Math.min(1, c.used / c.max) : undefined
  const level = share === undefined ? '' : share >= 0.9 ? ' full' : share >= 0.75 ? ' high' : ''
  const title =
    `Kontext nach dem letzten Turn: ${c.used.toLocaleString('de-DE')} Tokens` +
    (c.max ? ` von ${c.max.toLocaleString('de-DE')} (${pct(share!)})` : '') +
    '\nDie CLI verdichtet selbst, wenn es eng wird.'
  return (
    <span className={`context-gauge${level}`} title={title}>
      {share !== undefined && (
        <span className="context-bar">
          <span className="context-fill" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </span>
      )}
      <span className="context-text">{share !== undefined ? pct(share) : short(c.used)}</span>
    </span>
  )
}

const pct = (share: number): string => `${share < 0.01 ? Math.ceil(share * 100) : Math.round(share * 100)} %`

/** 39902 → „39,9k“ */
function short(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k.toLocaleString('de-DE', { maximumFractionDigits: k < 100 ? 1 : 0 })}k`
}
