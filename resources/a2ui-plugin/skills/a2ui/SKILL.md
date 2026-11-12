---
name: a2ui
description: Zeigt interaktive Oberflächen (Formulare, Tabellen, Kennzahlen/KPIs, Diagramme/Charts, Fortschrittsbalken, Hinweise, Code, Bilder auch aus lokalen Dateien, Dashboards) direkt im Chat der App Claude2UI an, über das MCP-Tool render_ui im A2UI-Format v1.0. Verwenden, wenn der Nutzer ausdrücklich eine Oberfläche, einen Screen, ein Formular, „A2UI“ o. Ä. wünscht, oder wenn eine Nachricht mit „A2UI-Aktion:“ beginnt (Interaktion mit einem bereits angezeigten Screen).
---

# A2UI-Screens im Chat rendern

Die App Claude2UI kann A2UI-Oberflächen (Protokoll v1.0) direkt im Chat anzeigen. Ihr Katalog enthält alle
Komponenten des A2UI-Basic-Catalog **plus**:
- Diagramme: **LineChart, BarChart, PieChart, ScatterChart**
- **Table** (sortierbar, Zeilen auswählbar), **Metric** (KPI-Kachel mit Veränderung und Verlauf), **Progress**,
  **Alert** (Hinweisbox), **Badge** (Status-Etikett), **Link** (E-Mail, Telefon, Web), **CodeBlock** (Quelltext mit Hervorhebung)
- ein **Image, das auch lokale Dateien** zeigt (Pfad absolut, mit `~` oder relativ zum Arbeitsverzeichnis)
Du lieferst sie über das Tool **`render_ui`** (MCP-Server `a2ui`, volle Bezeichnung `mcp__a2ui__render_ui`).

## Eigene Komponenten des Nutzers

Der Nutzer kann eigene Komponenten anlegen (z. B. `ContactCard`). Welche es gibt, liefert das Tool
**`describe_components`** (MCP-Server `a2ui`) – rufe es **vor dem ersten Screen einer Session** auf.
Eigene Komponenten verwendest du wie eingebaute: `{"id": "k1", "component": "ContactCard", "name": "…"}`
mit genau den dokumentierten Eigenschaften. Passt eine eigene Komponente zur Aufgabe, nimm sie bevorzugt –
der Nutzer hat sie genau dafür angelegt. `describe_components` mit `"names"` liefert auch die Doku eingebauter Komponenten.

### Neue eigene Komponenten anlegen

Bittet der Nutzer darum, eine **Komponente zu bauen oder zu ändern** (z. B. „Bau mir ein Kanban-Widget“), dann schreibe
sie als `<Name>/component.json` in den Komponenten-Ordner (Pfad und Anleitung nennt `describe_components`; lies die
Anleitung vorher). Prüfe danach mit `describe_components`, dass sie geladen wurde, und zeige sie in einem Vorschau-Screen.
Bestehende Screens zeichnet die App nach Änderungen an Komponenten automatisch neu.

## Wann

- Nur wenn der Nutzer eine Oberfläche wünscht oder mit einem bestehenden Screen interagiert.
  Ohne solchen Wunsch antwortest du ganz normal mit Text – so wie du auch nicht ungefragt HTML schreibst.
- Wiederhole den Inhalt eines Screens nicht zusätzlich als Text. Höchstens ein kurzer Satz.

## Wie

`render_ui` bekommt `{"messages": [ ... ]}` – eine Liste von A2UI-v1.0-Nachrichten, die der Reihe nach angewendet werden.
Jede Nachricht hat `"version": "1.0"` und genau einen dieser Schlüssel:

- **`createSurface`** – neuer Screen: `surfaceId` (eindeutig und sprechend, z. B. `"bestellung"`),
  `catalogId` (`https://claude2ui.local/catalogs/v1/catalog.json` – der Katalog von Claude2UI),
  `components` (flache Liste, genau eine Komponente mit `"id": "root"`), optional `dataModel`.
- **`updateComponents`** – `surfaceId` + `components`: fügt Komponenten hinzu oder ersetzt sie (gleiche `id` = ersetzen).
- **`updateDataModel`** – `surfaceId`, `path` (JSON Pointer, Standard `/`), `value`: setzt einen Wert (`null` löscht).
- **`deleteSurface`** – `surfaceId`: entfernt den Screen.

Regeln:
- Kinder werden immer per ID referenziert, nie verschachtelt eingebettet. Jede referenzierte ID muss existieren.
- Werte, die sich ändern oder vom Nutzer eingegeben werden, bindest du an das Datenmodell: `{"@path": "/form/name"}`.
- Für Text mit eingesetzten Werten: `{"@call": "formatString", "args": {"value": "Hallo ${/user/name}"}}`.
- Ein Screen bleibt im Chat stehen. **Ändere ihn in-place** mit `updateDataModel`/`updateComponents` und derselben
  `surfaceId`. Lege für dieselbe ID nie ein zweites `createSurface` an.
- Meldet das Tool einen Validierungsfehler, wurde nichts angezeigt: korrigieren und den ganzen Aufruf wiederholen.
- Bilder: `http(s):`, `data:` oder lokale Bilddateien (z. B. ein Plot, den du gerade gespeichert hast). Videos/Audio nur per `http(s):`.
- Diagramme: Daten als Liste von Zeilen-Objekten ins Datenmodell, das Chart bindet sie per `@path`.

## Interaktion

Eingaben (TextField, CheckBox, ChoicePicker, Slider, DateTimeInput) schreiben nur lokal ins Datenmodell.
Erst ein **Button** mit `action.event` schickt etwas an dich. Gib dafür im `context` per `@path` alles mit, was du brauchst:

```json
{"id": "senden", "component": "Button", "variant": "primary", "child": "sendenText",
 "action": {"event": {"name": "absenden", "context": {"formular": {"@path": "/form"}}}}}
```

Klickt der Nutzer, bekommst du eine Nachricht der Form
`A2UI-Aktion: {"name": "absenden", "surfaceId": "...", "sourceComponentId": "senden", "context": {...}}`.
Reagiere darauf in der Regel, indem du **denselben Screen aktualisierst** (z. B. Ergebnis oder Bestätigung per
`updateDataModel`, neue Bereiche per `updateComponents`). Antworte nur mit Text, wenn das besser passt.

## Beispiel

```json
{"messages": [
  {"version": "1.0", "createSurface": {
    "surfaceId": "zinsrechner",
    "catalogId": "https://claude2ui.local/catalogs/v1/catalog.json",
    "components": [
      {"id": "root", "component": "Card", "child": "col"},
      {"id": "col", "component": "Column", "children": ["titel", "betrag", "zins", "rechnen", "ergebnis"]},
      {"id": "titel", "component": "Text", "text": "## Zinsrechner"},
      {"id": "betrag", "component": "TextField", "label": "Betrag (€)", "variant": "number", "value": {"@path": "/eingabe/betrag"}},
      {"id": "zins", "component": "Slider", "label": "Zins (%)", "min": 0, "max": 10, "steps": 20, "value": {"@path": "/eingabe/zins"}},
      {"id": "rechnenText", "component": "Text", "text": "Berechnen"},
      {"id": "rechnen", "component": "Button", "variant": "primary", "child": "rechnenText",
       "action": {"event": {"name": "berechnen", "context": {"eingabe": {"@path": "/eingabe"}}}}},
      {"id": "ergebnis", "component": "Text", "text": {"@path": "/ergebnis"}}
    ],
    "dataModel": {"eingabe": {"betrag": 1000, "zins": 3}, "ergebnis": ""}
  }}
]}
```

Nach `A2UI-Aktion: {"name": "berechnen", ... "context": {"eingabe": {"betrag": 1000, "zins": 3}}}` aktualisierst du nur den Wert:

```json
{"messages": [{"version": "1.0", "updateDataModel": {"surfaceId": "zinsrechner", "path": "/ergebnis", "value": "Nach einem Jahr: **1.030 €**"}}]}
```

Ein Chart-Dashboard (zwei Diagramme nebeneinander, Daten im Datenmodell):

```json
{"messages": [
  {"version": "1.0", "createSurface": {
    "surfaceId": "umsatz",
    "catalogId": "https://claude2ui.local/catalogs/v1/catalog.json",
    "components": [
      {"id": "root", "component": "Column", "children": ["titel", "charts"]},
      {"id": "titel", "component": "Text", "text": "## Umsatz 1. Halbjahr"},
      {"id": "charts", "component": "Row", "children": ["verlauf", "anteile"]},
      {"id": "verlauf", "component": "LineChart", "weight": 2, "title": "Umsatz je Monat", "unit": "€",
       "data": {"@path": "/monate"}, "xKey": "monat", "series": [{"key": "umsatz", "label": "Umsatz"}]},
      {"id": "anteile", "component": "PieChart", "weight": 1, "title": "Nach Region", "donut": true,
       "data": {"@path": "/regionen"}}
    ],
    "dataModel": {
      "monate": [{"monat": "Jan", "umsatz": 120}, {"monat": "Feb", "umsatz": 135}, {"monat": "Mär", "umsatz": 160}],
      "regionen": [{"label": "Nord", "value": 45}, {"label": "Süd", "value": 30}, {"label": "West", "value": 25}]
    }
  }}
]}
```

## Referenz

Alle Komponenten (Basic Catalog + Charts + Image) mit ihren Eigenschaften sowie die Funktionen (`required`,
`formatString`, `formatCurrency`, …) stehen in **`reference.md`** in diesem Skill-Verzeichnis. Lies sie vor dem ersten
Screen einer Session.
