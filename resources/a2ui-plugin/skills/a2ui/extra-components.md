## Zusätzliche Komponenten von C2UI

Diese Komponenten gibt es nur im Katalog von C2UI (`catalogId` siehe oben). Sie ergänzen bzw. ersetzen den Basic Catalog.

### Image (ersetzt das Image des Basic Catalog)
- `url` **Pflicht**: DynamicString – `http(s):`- oder `data:`-URL **oder lokaler Pfad**: absolut (`/Users/…/bild.png`),
  mit `~` (`~/Bilder/x.jpg`) oder **relativ zum Arbeitsverzeichnis des Chats** (`plots/umsatz.png`). Erlaubt sind
  Bilddateien (png, jpg, jpeg, gif, webp, svg, bmp, avif, ico). So kannst du z. B. ein Diagramm, das du per Skript
  erzeugt und gespeichert hast, direkt anzeigen.
- `description`: DynamicString – Alternativtext.
- `fit`: 'contain' | 'cover' | 'fill' | 'none' | 'scaleDown' (Standard: "contain").
- `variant`: 'icon' | 'avatar' | 'smallFeature' | 'mediumFeature' | 'largeFeature' | 'header' (Standard: "mediumFeature").

### LineChart – Liniendiagramm (Verlauf, Zeitreihe)
- `data` **Pflicht**: DynamicValue – Liste von Datenzeilen (Objekte), meist `{"@path": "/umsatz"}`.
- `xKey` **Pflicht**: string – Spalte für die x-Achse.
- `series` **Pflicht**: { key: string, label?: string, color?: string }[] – eine Linie je Eintrag; `key` ist die Wert-Spalte.
- `title`: DynamicString – Überschrift.
- `unit`: string – Einheit für Werte, z. B. "€" oder "%".
- `height`: number – Höhe in Pixeln (Standard 260).
- `area`: boolean – Fläche unter der Linie füllen.
- `curved`: boolean – Linie glätten (Standard true).

### BarChart – Balkendiagramm (Vergleich von Kategorien)
- `data` **Pflicht**, `xKey` **Pflicht**, `series` **Pflicht**, `title`, `unit`, `height` – wie LineChart.
- `stacked`: boolean – Reihen übereinander stapeln.
- `horizontal`: boolean – Balken waagerecht.

### PieChart – Kreis-/Ringdiagramm (Anteile)
- `data` **Pflicht**: DynamicValue – Datenzeilen, z. B. `[{"label": "Miete", "value": 900}]`.
- `labelKey`: string – Spalte mit dem Segmentnamen (Standard "label").
- `valueKey`: string – Spalte mit dem Wert (Standard "value").
- `donut`: boolean – als Ring darstellen.
- `title`, `unit`, `height` – wie oben.

### ScatterChart – Streudiagramm (Zusammenhang zweier Zahlen)
- `data` **Pflicht**: DynamicValue – Datenzeilen, z. B. `[{"name": "A", "preis": 12, "absatz": 340, "segment": "Premium"}]`.
- `xKey` **Pflicht**: string – Spalte für die x-Achse (Zahl).
- `yKey` **Pflicht**: string – Spalte für die y-Achse (Zahl).
- `groupKey`: string – Spalte, nach der Punkte eingefärbt werden (mit Legende).
- `labelKey`: string – Spalte mit dem Namen eines Punktes.
- `xLabel`, `yLabel`: string – Achsenbeschriftungen. `xUnit`, `yUnit`: string – Einheiten.
- `title`, `height` – wie oben.

Alle Charts haben außerdem `weight` (Flex-Anteil in Row/Column), z. B. zwei Charts nebeneinander in einer Row mit `weight: 1`.
Zahlen als Zahlen liefern (nicht als Text). Ändern sich Werte, genügt `updateDataModel` auf den gebundenen Pfad – das Diagramm aktualisiert sich in-place.

### Table – Tabelle (sortierbar, Zeilen auswählbar)
- `columns` **Pflicht**: { key: string, label?: string, format?: Format, currency?: string, align?: 'left' | 'center' | 'right' }[]
  – Spalten in Anzeige-Reihenfolge; Zahlenformate werden rechtsbündig gesetzt.
- `data` **Pflicht**: DynamicValue – Liste von Datenzeilen (Objekte), meist `{"@path": "/zeilen"}`.
- `title`: DynamicString – Überschrift.
- `sortable`: boolean – Sortieren per Klick auf die Spaltenüberschrift (Standard true).
- `maxHeight`: number – maximale Höhe in Pixeln, darüber scrollt die Tabelle (Kopfzeile bleibt stehen).
- `selected`: DynamicValue – Bindung, z. B. `{"@path": "/auswahl"}`: ein Zeilenklick schreibt die ganze Zeile dorthin.
- `action`: Action – wird nach einem Zeilenklick ausgelöst. Die Zeile im `context` mitgeben:
  `"action": {"event": {"name": "zeile_gewaehlt", "context": {"zeile": {"@path": "/auswahl"}}}}`.
- `emptyText`: string – Text, wenn keine Zeilen vorhanden sind.

`Format` (für Table-Spalten und Metric): `'text' | 'number' | 'currency' | 'percent' | 'date'` –
number → 1.234,5 · currency → 1.234,50 € (`currency` = ISO-Code, Standard EUR) · percent → Wert ist bereits in Prozent (12.5 → 12,5 %) ·
date → ISO-Datum wird zu 12.11.2026.

### Metric – Kennzahl-Kachel (KPI)
- `label` **Pflicht**: DynamicString – Bezeichnung, z. B. "Umsatz Q3".
- `value` **Pflicht**: DynamicValue – der Wert (Zahl oder Text).
- `format`: Format (siehe Table), `currency`: string, `unit`: string – Einheit hinter dem Wert (nicht bei currency/percent).
- `delta`: DynamicNumber – Veränderung in Prozent (12.5 oder -3), mit Pfeil und Farbe.
- `deltaLabel`: DynamicString – Bezug, z. B. "ggü. Vormonat".
- `higherIsBetter`: boolean – Steigerung ist gut/grün (Standard true; false z. B. für Kosten oder Fehlerquote).
- `trend`: DynamicValue – Zahlenreihe für eine kleine Verlaufslinie, z. B. `[3, 5, 4, 8]`.
Mehrere Metrics nebeneinander: in eine Row mit `weight: 1` je Kachel.

### Progress – Fortschrittsbalken
- `value` **Pflicht**: DynamicNumber – aktueller Wert.
- `max`: number – Maximalwert (Standard 100).
- `label`: DynamicString – Beschriftung über dem Balken.
- `showValue`: boolean – Prozentwert anzeigen (Standard true).
- `tone`: 'accent' | 'success' | 'warning' | 'error' – Farbe.

### Alert – Hinweisbox
- `text` **Pflicht**: DynamicString – Inhalt, einfaches Markdown erlaubt.
- `tone`: 'info' | 'success' | 'warning' | 'error' (Standard info).
- `title`: DynamicString – fette Überschrift.

### Badge – Status-Etikett
- `text` **Pflicht**: DynamicString – kurzer Text, z. B. "offen" oder "v2.1".
- `tone`: 'neutral' | 'info' | 'success' | 'warning' | 'error' (Standard neutral).

### Link – anklickbare Adresse (Web, E-Mail, Telefon)
- `url` **Pflicht**: DynamicString – `"https://…"` (Browser), `"mailto:name@firma.de"` (Mail-App, auch mit `?subject=…`) oder `"tel:+49…"` (Telefon). Andere Schemata werden nicht geöffnet.
- `text`: DynamicString – angezeigter Text (Standard: die Adresse ohne `mailto:`/`tel:`/`https://`).
- `variant`: 'body' | 'caption' – Schriftgröße wie bei Text (Standard body).
Sieht aus wie ein Text, blau und unterstrichen; nach dem Klick violett. Öffnet direkt, ohne Nachricht an dich.
Für E-Mail-Adressen, Telefonnummern und Webseiten statt eines Buttons verwenden.

### CodeBlock – Quelltext mit Hervorhebung und Kopier-Knopf
- `code` **Pflicht**: DynamicString – der Quelltext.
- `language`: string – z. B. "ts", "python", "json", "bash", "sql" (sonst automatisch erkannt).
- `title`: DynamicString – Titelzeile, z. B. ein Dateiname.
- `maxHeight`: number – maximale Höhe in Pixeln (Standard 420), darüber scrollt der Block.

Alle Zusatzkomponenten haben `weight` (Flex-Anteil in Row/Column).
