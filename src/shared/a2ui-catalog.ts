import { z } from 'zod'
import { basicCatalog, Catalog, CommonSchemas, type ComponentApi } from '@a2ui/web_core/v1_0'

/**
 * Katalog von Claude2UI: alle Komponenten des A2UI-Basic-Catalog, dazu Charts, und ein Image,
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

export const EXTRA_APIS: ComponentApi[] = [ImageApi, LineChartApi, BarChartApi, PieChartApi]

/**
 * Baut den Katalog. `impls` ersetzt APIs durch Implementierungen (Renderer); ohne bleibt es
 * ein reiner Validierungs-Katalog (MCP-Server).
 */
export function buildClaude2uiCatalog(impls: Record<string, ComponentApi> = {}): Catalog<ComponentApi> {
  const extraNames = new Set(EXTRA_APIS.map((a) => a.name))
  const base = [...basicCatalog.components.values()].filter((c) => !extraNames.has(c.name))
  const extras = EXTRA_APIS.map((a) => impls[a.name] ?? a)
  return new Catalog(CLAUDE2UI_CATALOG_ID, '1.0', [...base, ...extras] as ComponentApi[], [
    ...basicCatalog.functions.values()
  ])
}
