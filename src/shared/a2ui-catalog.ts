import { z } from 'zod'
import { basicCatalog, Catalog, CommonSchemas, createFunctionImplementation, OpenUrlApi, type ComponentApi } from '@a2ui/web_core/v1_0'

/**
 * Katalog von C2UI: alle Komponenten des A2UI-Basic-Catalog, dazu Charts, und ein Image,
 * das auch lokale Dateien anzeigen kann. Hier stehen nur die APIs (Name + Schema) – damit
 * kann der MCP-Server ohne React validieren. Die React-Implementierungen hängt der Renderer an.
 */
import { CLAUDE2UI_CATALOG_ID } from './a2ui'
export { CLAUDE2UI_CATALOG_ID }

const Common = {
  weight: z.number().optional().describe('Flex-Anteil, wenn direktes Kind von Row/Column.')
}

const Series = z
  .array(
    z.object({
      key: z.string().describe('Spalte in den Datenzeilen, die als Reihe gezeichnet wird.'),
      label: z.string().optional().describe('Anzeigename der Reihe (Standard: key).'),
      color: z.string().optional().describe('CSS-Farbe; Standard: Farbpalette der App.')
    })
  )
  .min(1)

const ChartBase = {
  title: CommonSchemas.DynamicString.optional().describe('Überschrift über dem Diagramm.'),
  data: CommonSchemas.DynamicValue.describe(
    'Liste von Datenzeilen (Objekte), meist als Bindung {"@path": "/umsatz"}, z. B. [{"monat": "Jan", "umsatz": 120}].'
  ),
  height: z.number().min(80).max(800).optional().describe('Höhe in Pixeln (Standard 260).'),
  unit: z.string().optional().describe('Einheit für Werte in Tooltip und Achse, z. B. "€" oder "%".'),
  ...Common
}

export const LineChartApi = {
  name: 'LineChart',
  schema: z
    .object({
      ...ChartBase,
      xKey: z.string().describe('Spalte für die x-Achse (Kategorie oder Zeit).'),
      series: Series.describe('Eine oder mehrere Linien.'),
      area: z.boolean().optional().describe('Fläche unter der Linie füllen.'),
      curved: z.boolean().optional().describe('Linie glätten (Standard true).')
    })
    .strict()
} satisfies ComponentApi

export const BarChartApi = {
  name: 'BarChart',
  schema: z
    .object({
      ...ChartBase,
      xKey: z.string().describe('Spalte für die Kategorien.'),
      series: Series.describe('Eine oder mehrere Balkenreihen.'),
      stacked: z.boolean().optional().describe('Reihen stapeln.'),
      horizontal: z.boolean().optional().describe('Balken waagerecht statt senkrecht.')
    })
    .strict()
} satisfies ComponentApi

export const PieChartApi = {
  name: 'PieChart',
  schema: z
    .object({
      ...ChartBase,
      labelKey: z.string().optional().describe('Spalte mit dem Namen des Segments (Standard "label").'),
      valueKey: z.string().optional().describe('Spalte mit dem Wert des Segments (Standard "value").'),
      donut: z.boolean().optional().describe('Als Ring mit Loch darstellen.')
    })
    .strict()
} satisfies ComponentApi

export const ImageApi = {
  name: 'Image',
  schema: z
    .object({
      url: CommonSchemas.DynamicString.describe(
        'http(s)-URL, data:-URL ODER lokaler Pfad: absolut, mit ~ oder relativ zum Arbeitsverzeichnis des Chats.'
      ),
      description: CommonSchemas.DynamicString.optional().describe('Alternativtext.'),
      fit: z.enum(['contain', 'cover', 'fill', 'none', 'scaleDown']).optional(),
      variant: z.enum(['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header']).optional(),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const ScatterChartApi = {
  name: 'ScatterChart',
  schema: z
    .object({
      title: ChartBase.title,
      data: ChartBase.data,
      height: ChartBase.height,
      xKey: z.string().describe('Spalte für die x-Achse (Zahl).'),
      yKey: z.string().describe('Spalte für die y-Achse (Zahl).'),
      groupKey: z.string().optional().describe('Spalte, nach der Punkte eingefärbt und in der Legende gruppiert werden.'),
      labelKey: z.string().optional().describe('Spalte mit dem Namen eines Punktes (im Tooltip).'),
      xLabel: z.string().optional().describe('Beschriftung der x-Achse.'),
      yLabel: z.string().optional().describe('Beschriftung der y-Achse.'),
      xUnit: z.string().optional().describe('Einheit der x-Werte.'),
      yUnit: z.string().optional().describe('Einheit der y-Werte.'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

/** Darstellungsformate für Werte in Table und Metric. */
const Format = z
  .enum(['text', 'number', 'currency', 'percent', 'date'])
  .describe('text, number (1.234,5), currency (1.234,50 €), percent (Wert ist schon in Prozent: 12.5 → 12,5 %), date (ISO-Datum → 12.11.2026).')
const Tone = z.enum(['neutral', 'info', 'success', 'warning', 'error'])

export const TableApi = {
  name: 'Table',
  schema: z
    .object({
      title: CommonSchemas.DynamicString.optional().describe('Überschrift über der Tabelle.'),
      columns: z
        .array(
          z.object({
            key: z.string().describe('Spalte in den Datenzeilen.'),
            label: z.string().optional().describe('Spaltenüberschrift (Standard: key).'),
            format: Format.optional(),
            currency: z.string().optional().describe('ISO-Währung für format "currency" (Standard EUR).'),
            align: z.enum(['left', 'center', 'right']).optional().describe('Ausrichtung (Zahlen standardmäßig rechts).')
          })
        )
        .min(1)
        .describe('Spalten in Anzeige-Reihenfolge.'),
      data: CommonSchemas.DynamicValue.describe('Liste von Datenzeilen (Objekte), meist {"@path": "/zeilen"}.'),
      sortable: z.boolean().optional().describe('Sortieren per Klick auf die Spaltenüberschrift (Standard true).'),
      maxHeight: z.number().min(80).optional().describe('Maximale Höhe in Pixeln, darüber scrollt die Tabelle.'),
      selected: CommonSchemas.DynamicValue.optional().describe(
        'Bindung {"@path": "/auswahl"}: ein Klick auf eine Zeile schreibt die Zeile (Objekt) dorthin.'
      ),
      action: CommonSchemas.Action.optional().describe(
        'Wird nach einem Zeilenklick ausgelöst; die Zeile per {"@path": "/auswahl"} im context mitgeben.'
      ),
      emptyText: z.string().optional().describe('Text, wenn keine Zeilen vorhanden sind.'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const MetricApi = {
  name: 'Metric',
  schema: z
    .object({
      label: CommonSchemas.DynamicString.describe('Bezeichnung der Kennzahl, z. B. "Umsatz Q3".'),
      value: CommonSchemas.DynamicValue.describe('Der Wert (Zahl oder Text).'),
      format: Format.optional(),
      currency: z.string().optional().describe('ISO-Währung für format "currency" (Standard EUR).'),
      unit: z.string().optional().describe('Einheit hinter dem Wert, z. B. "Std." (nicht für currency/percent).'),
      delta: CommonSchemas.DynamicNumber.optional().describe('Veränderung in Prozent, z. B. 12.5 oder -3.'),
      deltaLabel: CommonSchemas.DynamicString.optional().describe('Bezug der Veränderung, z. B. "ggü. Vormonat".'),
      higherIsBetter: z.boolean().optional().describe('Steigerung ist gut (grün); false für z. B. Kosten (Standard true).'),
      trend: CommonSchemas.DynamicValue.optional().describe('Zahlenreihe für eine kleine Verlaufslinie, z. B. [3, 5, 4, 8].'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const ProgressApi = {
  name: 'Progress',
  schema: z
    .object({
      value: CommonSchemas.DynamicNumber.describe('Aktueller Wert.'),
      max: z.number().positive().optional().describe('Maximalwert (Standard 100).'),
      label: CommonSchemas.DynamicString.optional().describe('Beschriftung über dem Balken.'),
      showValue: z.boolean().optional().describe('Prozentwert anzeigen (Standard true).'),
      tone: z.enum(['accent', 'success', 'warning', 'error']).optional().describe('Farbe (Standard accent).'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const AlertApi = {
  name: 'Alert',
  schema: z
    .object({
      tone: z.enum(['info', 'success', 'warning', 'error']).optional().describe('Art des Hinweises (Standard info).'),
      title: CommonSchemas.DynamicString.optional().describe('Fette Überschrift.'),
      text: CommonSchemas.DynamicString.describe('Inhalt, einfaches Markdown erlaubt.'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const BadgeApi = {
  name: 'Badge',
  schema: z
    .object({
      text: CommonSchemas.DynamicString.describe('Kurzer Text, z. B. "offen" oder "v2.1".'),
      tone: Tone.optional().describe('Farbe (Standard neutral).'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const LinkApi = {
  name: 'Link',
  schema: z
    .object({
      url: CommonSchemas.DynamicString.describe(
        'Ziel: "https://…" (Browser), "mailto:name@firma.de" (Mail-App, auch mit ?subject=…) oder "tel:+49…" (Telefon).'
      ),
      text: CommonSchemas.DynamicString.optional().describe(
        'Angezeigter Text (Standard: die Adresse ohne "mailto:"/"tel:"/"https://").'
      ),
      variant: z.enum(['body', 'caption']).optional().describe('Schriftgröße wie Text: body (Standard) oder caption (klein).'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const CodeBlockApi = {
  name: 'CodeBlock',
  schema: z
    .object({
      code: CommonSchemas.DynamicString.describe('Der Quelltext.'),
      language: z.string().optional().describe('Sprache für die Hervorhebung, z. B. "ts", "python", "json", "bash", "sql".'),
      title: CommonSchemas.DynamicString.optional().describe('Titelzeile, z. B. ein Dateiname.'),
      maxHeight: z.number().min(80).optional().describe('Maximale Höhe in Pixeln, darüber scrollt der Block.'),
      ...Common
    })
    .strict()
} satisfies ComponentApi

export const EXTRA_APIS: ComponentApi[] = [
  ImageApi,
  LineChartApi,
  BarChartApi,
  PieChartApi,
  ScatterChartApi,
  TableApi,
  MetricApi,
  ProgressApi,
  AlertApi,
  BadgeApi,
  LinkApi,
  CodeBlockApi
]

/** Erlaubte Ziele von openUrl: Web, E-Mail, Telefon. Kein javascript:, file: usw. */
export const OPEN_URL_SCHEMES = /^(https?:|mailto:|tel:)/i

/** Anzeigetext eines Links ohne Schema: "mailto:ada@x.org" → "ada@x.org". */
export function linkLabel(url: string): string {
  return url
    .trim()
    .replace(/^(mailto:|tel:)/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\?.*$/, (q) => (/^mailto:/i.test(url.trim()) ? '' : q))
    .replace(/\/$/, '')
}

let openUrlHandler: (url: string) => void = () => {}
/** Öffnet eine erlaubte Adresse über das System; liefert false bei unerlaubtem Schema. */
export function openAllowedUrl(url: string): boolean {
  const u = url.trim()
  if (!OPEN_URL_SCHEMES.test(u)) return false
  openUrlHandler(u)
  return true
}
/** Renderer: wie openUrl tatsächlich öffnet (über den Main-Prozess, siehe shell:openExternal). */
export function setOpenUrlHandler(h: (url: string) => void): void {
  openUrlHandler = h
}

/**
 * openUrl wie im Basic Catalog, aber zusätzlich mit mailto: und tel: (die Spezifikation erlaubt
 * nur http/https). Geöffnet wird über das System – Mail-App bzw. Telefon.
 */
const OpenUrlImpl = createFunctionImplementation(OpenUrlApi as never, (args: { url?: unknown }) => {
  openAllowedUrl(String(args?.url ?? ''))
})

/**
 * Baut den Katalog. `impls` ersetzt APIs durch Implementierungen (Renderer); ohne bleibt es
 * ein reiner Validierungs-Katalog (MCP-Server).
 */
export function buildClaude2uiCatalog(impls: Record<string, ComponentApi> = {}): Catalog<ComponentApi> {
  const extraNames = new Set(EXTRA_APIS.map((a) => a.name))
  const base = [...basicCatalog.components.values()].filter((c) => !extraNames.has(c.name))
  const extras = EXTRA_APIS.map((a) => impls[a.name] ?? a)
  const functions = [...basicCatalog.functions.values()].map((f) => (f.name === 'openUrl' ? OpenUrlImpl : f))
  return new Catalog(CLAUDE2UI_CATALOG_ID, '1.0', [...base, ...extras] as ComponentApi[], functions as never)
}
