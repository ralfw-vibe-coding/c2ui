import { createContext, useContext, useState } from 'react'
import { createComponentImplementation } from '@a2ui/react/v0_9'
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { BarChartApi, ImageApi, LineChartApi, PieChartApi, setOpenUrlHandler } from '@shared/a2ui-catalog'
import { LOCAL_FILE_SCHEME } from '@shared/a2ui'
import { WIDGET_IMPLS } from './widgets'

// openUrl und Link öffnen über den Main-Prozess (prüft das Schema nochmals, dann shell.openExternal).
setOpenUrlHandler((url) => void window.api.openExternal(url))

/** Kontext des Chats, in dem ein Screen angezeigt wird (für relative Bildpfade). */
export const A2uiChatContext = createContext<{ cwd: string; home: string }>({ cwd: '', home: '' })

// Farben passend zur App (Akzent zuerst), gut unterscheidbar.
const PALETTE = ['#d97757', '#4e79a7', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#e15759', '#9c755f']
const color = (i: number, own?: string): string => own || PALETTE[i % PALETTE.length]

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const fmt = (unit?: string) => (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  const s = Number.isFinite(n) ? nf.format(n) : String(v ?? '')
  return unit ? `${s} ${unit}` : s
}

/** Datenzeilen robust aufbereiten: nur Objekte, numerische Strings werden Zahlen. */
function rows(data: unknown, numericKeys: string[]): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const o: Record<string, unknown> = { ...(r as Record<string, unknown>) }
      for (const k of numericKeys) {
        const v = o[k]
        if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) o[k] = Number(v)
      }
      return o
    })
}

function ChartFrame({ title, height, empty, children }: { title?: string; height: number; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="c2-chart">
      {title && <div className="c2-chart-title">{title}</div>}
      {empty ? (
        <div className="c2-chart-empty" style={{ height: Math.min(height, 120) }}>
          Keine Daten
        </div>
      ) : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  itemStyle: { padding: 0 }
}

export const LineChartImpl = createComponentImplementation(LineChartApi, ({ props }) => {
  const series = props.series ?? []
  const data = rows(props.data, series.map((s) => s.key))
  const area = !!props.area
  const curve = props.curved === false ? 'linear' : 'monotone'
  return (
    <ChartFrame title={props.title ?? undefined} height={props.height ?? 260} empty={data.length === 0}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={props.xKey} />
        <YAxis tickFormatter={fmt(props.unit)} width={56} />
        <Tooltip formatter={fmt(props.unit)} {...tooltipStyle} />
        {series.length > 1 && <Legend />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type={curve} dataKey={s.key} name={s.label ?? s.key} stroke={color(i, s.color)} fill={color(i, s.color)} fillOpacity={0.18} strokeWidth={2} />
          ) : (
            <Line key={s.key} type={curve} dataKey={s.key} name={s.label ?? s.key} stroke={color(i, s.color)} strokeWidth={2} dot={data.length <= 24} />
          )
        )}
      </ComposedChart>
    </ChartFrame>
  )
})

export const BarChartImpl = createComponentImplementation(BarChartApi, ({ props }) => {
  const series = props.series ?? []
  const data = rows(props.data, series.map((s) => s.key))
  const horizontal = !!props.horizontal
  return (
    <ChartFrame title={props.title ?? undefined} height={props.height ?? 260} empty={data.length === 0}>
      <ComposedChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={fmt(props.unit)} />
            <YAxis type="category" dataKey={props.xKey} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey={props.xKey} />
            <YAxis tickFormatter={fmt(props.unit)} width={56} />
          </>
        )}
        <Tooltip formatter={fmt(props.unit)} cursor={{ fill: 'var(--accent-soft)' }} {...tooltipStyle} />
        {series.length > 1 && <Legend />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={color(i, s.color)}
            stackId={props.stacked ? 'stack' : undefined}
            radius={props.stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
          />
        ))}
      </ComposedChart>
    </ChartFrame>
  )
})

export const PieChartImpl = createComponentImplementation(PieChartApi, ({ props }) => {
  const labelKey = props.labelKey ?? 'label'
  const valueKey = props.valueKey ?? 'value'
  const data = rows(props.data, [valueKey]).filter((r) => typeof r[valueKey] === 'number')
  const total = data.reduce((a, r) => a + (r[valueKey] as number), 0)
  return (
    <ChartFrame title={props.title ?? undefined} height={props.height ?? 260} empty={data.length === 0}>
      <PieChart>
        <Tooltip formatter={fmt(props.unit)} {...tooltipStyle} />
        <Legend />
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={labelKey}
          innerRadius={props.donut ? '55%' : 0}
          outerRadius="80%"
          paddingAngle={props.donut ? 2 : 0}
          label={({ percent }: { percent?: number }) => (total > 0 && (percent ?? 0) >= 0.04 ? `${Math.round((percent ?? 0) * 100)} %` : '')}
          labelLine={false}
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={color(i)} stroke="var(--bg)" />
          ))}
        </Pie>
      </PieChart>
    </ChartFrame>
  )
})

/** Wandelt eine Bildangabe in eine ladbare URL; lokale Pfade gehen über das App-Protokoll. */
export function resolveImageUrl(url: string, cwd: string, home: string): string {
  const u = url.trim()
  if (/^(https?:|data:|blob:)/i.test(u)) return u
  let path = u
  if (/^file:\/\//i.test(u)) path = decodeURIComponent(u.replace(/^file:\/\//i, ''))
  else if (u === '~' || u.startsWith('~/')) path = home + u.slice(1)
  else if (!u.startsWith('/')) path = (cwd.replace(/\/+$/, '') + '/' + u.replace(/^\.\//, ''))
  return `${LOCAL_FILE_SCHEME}://local${path.split('/').map(encodeURIComponent).join('/')}`
}

const IMAGE_SIZES: Record<string, React.CSSProperties> = {
  icon: { width: 24, height: 24 },
  avatar: { width: 40, height: 40, borderRadius: '50%' },
  smallFeature: { width: 100, maxWidth: '100%' },
  mediumFeature: { width: 'min(100%, 360px)' },
  largeFeature: { width: 'min(100%, 640px)' },
  header: { width: '100%', maxHeight: 280 }
}
const FIT: Record<string, React.CSSProperties['objectFit']> = { scaleDown: 'scale-down' }

export const ImageImpl = createComponentImplementation(ImageApi, ({ props }) => {
  const { cwd, home } = useContext(A2uiChatContext)
  const [failed, setFailed] = useState(false)
  const raw = props.url ?? ''
  if (!raw) return null
  const src = resolveImageUrl(raw, cwd, home)
  const style: React.CSSProperties = {
    ...(IMAGE_SIZES[props.variant ?? 'mediumFeature'] ?? IMAGE_SIZES.mediumFeature),
    objectFit: FIT[props.fit ?? ''] ?? (props.fit as React.CSSProperties['objectFit']) ?? 'contain'
  }
  if (failed) {
    return (
      <div className="c2-image-missing" title={raw}>
        Bild nicht gefunden: {raw}
      </div>
    )
  }
  return <img className="c2-image" src={src} alt={props.description ?? ''} style={style} onError={() => setFailed(true)} draggable={false} />
})

export const COMPONENT_IMPLS = {
  ...WIDGET_IMPLS,
  Image: ImageImpl,
  LineChart: LineChartImpl,
  BarChart: BarChartImpl,
  PieChart: PieChartImpl
}
