import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js/lib/common'
import { createComponentImplementation } from '@a2ui/react/v0_9'
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import {
  AlertApi,
  BadgeApi,
  CodeBlockApi,
  MetricApi,
  ProgressApi,
  ScatterChartApi,
  TableApi
} from '@shared/a2ui-catalog'

// ---------- Formatierung ----------

type Fmt = 'text' | 'number' | 'currency' | 'percent' | 'date'

export function formatValue(v: unknown, format?: Fmt, currency = 'EUR'): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  switch (format) {
    case 'number':
      return Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(v)
    case 'currency':
      return Number.isFinite(n) ? n.toLocaleString('de-DE', { style: 'currency', currency }) : String(v)
    case 'percent':
      return Number.isFinite(n) ? `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : String(v)
    case 'date': {
      const d = new Date(String(v))
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('de-DE')
    }
    default:
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
}

const isNumeric = (format?: Fmt): boolean => format === 'number' || format === 'currency' || format === 'percent'

function compare(a: unknown, b: unknown): number {
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && a !== '' && b !== '') return na - nb
  return String(a ?? '').localeCompare(String(b ?? ''), 'de', { numeric: true })
}

// ---------- Table ----------

export const TableImpl = createComponentImplementation(TableApi, ({ props }) => {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [selIndex, setSelIndex] = useState<number | null>(null)
  const columns = props.columns ?? []
  const data = useMemo(
    () => (Array.isArray(props.data) ? (props.data as unknown[]).filter((r) => r && typeof r === 'object') : []) as Record<string, unknown>[],
    [props.data]
  )
  const rows = useMemo(() => {
    const indexed = data.map((r, i) => ({ r, i }))
    if (sort) indexed.sort((x, y) => sort.dir * compare(x.r[sort.key], y.r[sort.key]))
    return indexed
  }, [data, sort])
  const sortable = props.sortable !== false
  const clickable = !!props.action || props.setSelected !== undefined

  function onHeader(key: string): void {
    if (!sortable) return
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))
  }

  function onRow(r: Record<string, unknown>, i: number): void {
    if (!clickable) return
    setSelIndex(i)
    props.setSelected?.(r)
    props.action?.()
  }

  return (
    <div className="c2-table-wrap">
      {props.title && <div className="c2-chart-title">{props.title}</div>}
      <div className="c2-table-scroll" style={{ maxHeight: props.maxHeight ?? undefined }}>
        <table className={`c2-table${clickable ? ' clickable' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => {
                const align = c.align ?? (isNumeric(c.format) ? 'right' : 'left')
                const active = sort?.key === c.key
                return (
                  <th key={c.key} style={{ textAlign: align }} onClick={() => onHeader(c.key)} className={sortable ? 'sortable' : ''}>
                    {c.label ?? c.key}
                    {active && <span className="c2-sort">{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i }) => (
              <tr key={i} onClick={() => onRow(r, i)} className={selIndex === i ? 'selected' : ''}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align ?? (isNumeric(c.format) ? 'right' : 'left') }}>
                    {formatValue(r[c.key], c.format, c.currency)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="c2-table-empty">
                  {props.emptyText ?? 'Keine Einträge'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// ---------- Metric ----------

function Sparkline({ values, good }: { values: number[]; good: boolean | null }) {
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ')
  const stroke = good === null ? 'var(--accent)' : good ? 'var(--ok)' : 'var(--danger)'
  return (
    <svg className="c2-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export const MetricImpl = createComponentImplementation(MetricApi, ({ props }) => {
  const fmt = (props.format ?? (typeof props.value === 'number' ? 'number' : 'text')) as Fmt
  const value = formatValue(props.value, fmt, props.currency)
  const delta = typeof props.delta === 'number' ? props.delta : null
  const higherIsBetter = props.higherIsBetter !== false
  const good = delta === null || delta === 0 ? null : delta > 0 === higherIsBetter
  const trend = Array.isArray(props.trend) ? (props.trend as unknown[]).map(Number).filter(Number.isFinite) : []
  return (
    <div className="c2-metric">
      <div className="c2-metric-label">{props.label}</div>
      <div className="c2-metric-row">
        <div className="c2-metric-value">
          {value}
          {props.unit && fmt !== 'currency' && fmt !== 'percent' && <span className="c2-metric-unit"> {props.unit}</span>}
        </div>
        <Sparkline values={trend} good={good} />
      </div>
      {delta !== null && (
        <div className={`c2-metric-delta ${good === null ? '' : good ? 'good' : 'bad'}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {delta > 0 ? '+' : ''}
          {delta.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
          {props.deltaLabel && <span className="muted"> {props.deltaLabel}</span>}
        </div>
      )}
    </div>
  )
})

// ---------- Progress ----------

export const ProgressImpl = createComponentImplementation(ProgressApi, ({ props }) => {
  const max = props.max ?? 100
  const value = typeof props.value === 'number' ? props.value : Number(props.value) || 0
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="c2-progress">
      {(props.label || props.showValue !== false) && (
        <div className="c2-progress-head">
          <span>{props.label}</span>
          {props.showValue !== false && <span className="muted">{Math.round(pct)} %</span>}
        </div>
      )}
      <div className="c2-progress-track" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className={`c2-progress-bar tone-${props.tone ?? 'accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
})

// ---------- Alert & Badge ----------

const ALERT_ICON: Record<string, string> = { info: 'ℹ', success: '✓', warning: '!', error: '✕' }

export const AlertImpl = createComponentImplementation(AlertApi, ({ props }) => {
  const tone = props.tone ?? 'info'
  return (
    <div className={`c2-alert tone-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="c2-alert-icon">{ALERT_ICON[tone]}</span>
      <div className="c2-alert-body">
        {props.title && <div className="c2-alert-title">{props.title}</div>}
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]}>{props.text ?? ''}</Markdown>
        </div>
      </div>
    </div>
  )
})

export const BadgeImpl = createComponentImplementation(BadgeApi, ({ props }) => (
  <span className={`c2-badge tone-${props.tone ?? 'neutral'}`}>{props.text}</span>
))

// ---------- CodeBlock ----------

export const CodeBlockImpl = createComponentImplementation(CodeBlockApi, ({ props }) => {
  const [copied, setCopied] = useState(false)
  const code = props.code ?? ''
  const html = useMemo(() => {
    const lang = props.language && hljs.getLanguage(props.language) ? props.language : undefined
    try {
      return lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value
    } catch {
      return null
    }
  }, [code, props.language])
  return (
    <div className="c2-code">
      <div className="c2-code-head">
        <span>{props.title ?? props.language ?? 'Code'}</span>
        <button
          className="c2-code-copy"
          onClick={() => {
            void navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <pre style={{ maxHeight: props.maxHeight ?? 420 }}>
        {html !== null ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  )
})

// ---------- ScatterChart ----------

const PALETTE = ['#d97757', '#4e79a7', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#e15759', '#9c755f']

export const ScatterChartImpl = createComponentImplementation(ScatterChartApi, ({ props }) => {
  const rows = (Array.isArray(props.data) ? (props.data as unknown[]) : [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const o = { ...(r as Record<string, unknown>) }
      o[props.xKey] = Number(o[props.xKey])
      o[props.yKey] = Number(o[props.yKey])
      return o
    })
    .filter((o) => Number.isFinite(o[props.xKey] as number) && Number.isFinite(o[props.yKey] as number))
  const groups = props.groupKey ? [...new Set(rows.map((r) => String(r[props.groupKey!] ?? '')))] : ['']
  const unit = (u?: string) => (v: unknown) => `${(v as number).toLocaleString('de-DE', { maximumFractionDigits: 2 })}${u ? ' ' + u : ''}`
  const height = props.height ?? 280
  return (
    <div className="c2-chart">
      {props.title && <div className="c2-chart-title">{props.title}</div>}
      {rows.length === 0 ? (
        <div className="c2-chart-empty" style={{ height: 120 }}>
          Keine Daten
        </div>
      ) : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: props.xLabel ? 18 : 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey={props.xKey} name={props.xLabel ?? props.xKey} tickFormatter={unit(props.xUnit)}
                label={props.xLabel ? { value: props.xLabel, position: 'insideBottom', offset: -10 } : undefined} />
              <YAxis type="number" dataKey={props.yKey} name={props.yLabel ?? props.yKey} tickFormatter={unit(props.yUnit)} width={60}
                label={props.yLabel ? { value: props.yLabel, angle: -90, position: 'insideLeft' } : undefined} />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [unit(name === (props.yLabel ?? props.yKey) ? props.yUnit : props.xUnit)(v), String(name)]}
                labelFormatter={() => ''}
              />
              {groups.length > 1 && <Legend verticalAlign="top" height={28} />}
              {groups.map((g, i) => (
                <Scatter
                  key={g || 'all'}
                  name={g || props.title || 'Werte'}
                  data={props.groupKey ? rows.filter((r) => String(r[props.groupKey!] ?? '') === g) : rows}
                  fill={PALETTE[i % PALETTE.length]}
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
})

export const WIDGET_IMPLS = {
  Table: TableImpl,
  Metric: MetricImpl,
  Progress: ProgressImpl,
  Alert: AlertImpl,
  Badge: BadgeImpl,
  CodeBlock: CodeBlockImpl,
  ScatterChart: ScatterChartImpl
}
