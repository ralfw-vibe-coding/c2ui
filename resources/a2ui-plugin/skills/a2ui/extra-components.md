## Zusätzliche Komponenten von Claude2UI

Diese Komponenten gibt es nur im Katalog von Claude2UI (`catalogId` siehe oben). Sie ergänzen bzw. ersetzen den Basic Catalog.

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

Alle Charts haben außerdem `weight` (Flex-Anteil in Row/Column), z. B. zwei Charts nebeneinander in einer Row mit `weight: 1`.
Zahlen als Zahlen liefern (nicht als Text). Ändern sich Werte, genügt `updateDataModel` auf den gebundenen Pfad – das Diagramm aktualisiert sich in-place.
