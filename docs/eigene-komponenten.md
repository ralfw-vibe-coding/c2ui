# Eigene A2UI-Komponenten bauen

Claude2UI zeigt Oberflächen, die Claude oder Codex im Chat erzeugen, mit dem A2UI-Protokoll an. Neben den eingebauten
Komponenten (Text, Button, Table, Charts, …) kannst du **eigene Komponenten** definieren – ohne Programmieren und ohne die
App neu zu bauen. Eine eigene Komponente ist eine **Vorlage aus vorhandenen Komponenten** mit eigenen Eigenschaften.

Typische Gründe:

- **Einheitliches Aussehen**: Eine `ContactCard` sieht immer gleich aus, egal wer sie anlegt.
- **Weniger Arbeit für das Modell**: `{"component": "ContactCard", "name": "Ada"}` statt zwanzig Zeilen Layout –
  das ist schneller, günstiger und weniger fehleranfällig.
- **Fachbegriffe**: Komponenten wie `Rechnungszeile`, `Ampel` oder `Kundenkopf` machen Screens zu deiner Domäne passend.

---

## Inhalt

1. [In fünf Minuten zur ersten Komponente](#in-fünf-minuten-zur-ersten-komponente)
1. [Mit Claude bauen: die Komponenten-Werkstatt](#mit-claude-bauen-die-komponenten-werkstatt)
2. [Wo die Komponenten liegen](#wo-die-komponenten-liegen)
3. [Aufbau einer `component.json`](#aufbau-einer-componentjson)
4. [Eigenschaften und ihre Typen](#eigenschaften-und-ihre-typen)
5. [Die Vorlage und Platzhalter](#die-vorlage-und-platzhalter)
6. [Optionale Eigenschaften lassen Teile weg](#optionale-eigenschaften-lassen-teile-weg)
7. [Slots: Inhalte von außen einsetzen](#slots-inhalte-von-außen-einsetzen)
8. [Aktionen (Buttons)](#aktionen-buttons)
9. [Daten binden](#daten-binden)
10. [Komponenten verschachteln](#komponenten-verschachteln)
11. [Wie Claude und Codex davon erfahren](#wie-claude-und-codex-davon-erfahren)
12. [Fehler finden](#fehler-finden)
13. [Tipps für gute Komponenten](#tipps-für-gute-komponenten)
14. [Was (noch) nicht geht](#was-noch-nicht-geht)
15. [Wie es technisch funktioniert](#wie-es-technisch-funktioniert)

---

## In fünf Minuten zur ersten Komponente

1. In Claude2UI **Einstellungen → Eigene A2UI-Komponenten → Ordner öffnen**.
2. Einen Unterordner anlegen, z. B. `KpiTile`, und darin eine Datei `component.json`:

```json
{
  "name": "KpiTile",
  "description": "Kennzahl-Kachel mit Titel, großem Wert und Kommentar.",
  "properties": {
    "title": { "type": "DynamicString", "required": true, "description": "Bezeichnung der Kennzahl." },
    "value": { "type": "DynamicString", "required": true, "description": "Der Wert, bereits formatiert, z. B. \"1.234 €\"." },
    "note": { "type": "DynamicString", "description": "Kurzer Kommentar unter dem Wert." }
  },
  "template": [
    { "id": "root", "component": "Card", "child": "col" },
    { "id": "col", "component": "Column", "children": ["title", "value", "note"] },
    { "id": "title", "component": "Text", "variant": "caption", "text": "$title" },
    { "id": "value", "component": "Text", "text": "$value" },
    { "id": "note", "component": "Text", "variant": "caption", "text": "$note" }
  ],
  "example": { "title": "Umsatz Q3", "value": "1,28 Mio. €", "note": "+12 % ggü. Q2" }
}
```

3. Fertig. In den Einstellungen erscheint `KpiTile` in der Liste. Ab sofort kann jeder Chat sie nutzen, z. B.:
   *„Zeig mir Umsatz, Kosten und Gewinn als KPI-Kacheln.“*

Die App beobachtet den Ordner; Änderungen wirken **sofort** für neue Screens und Aufrufe – ohne Neustart.

---

## Mit Claude bauen: die Komponenten-Werkstatt

Statt JSON von Hand zu schreiben, kannst du Komponenten im Gespräch mit Claude bauen („vibe coden“):

1. **Einstellungen → Eigene A2UI-Komponenten**: bei einer Komponente **„Mit Claude bearbeiten“** oder
   **„Neue Komponente mit Claude“**.
2. Es öffnet sich ein **Werkstatt-Chat** in einer neuen Zelle neben dem aktuellen – mit dem Komponenten-Ordner als
   Arbeitsverzeichnis und einem vorbereiteten Satzanfang im Eingabefeld.
3. Beschreibe, was du willst: *„Zeig mir erst eine Vorschau“*, *„Das Badge soll links stehen“*,
   *„Neue Komponente: Rechnungszeile mit Position, Menge, Einzelpreis, Summe“*.
4. Claude liest die Anleitung (`ANLEITUNG.md` im Ordner), schreibt die `component.json`, prüft mit
   `describe_components`, dass sie fehlerfrei geladen wurde, und zeigt eine **Vorschau** (Screen `vorschau-<name>`).
5. **Live-Vorschau:** Ändert sich eine Komponente, zeichnet Claude2UI alle bestehenden Screens mit der neuen Definition
   neu – die Vorschau (und jeder andere Screen, der die Komponente nutzt) ändert sich sofort sichtbar.

Auch **in jedem normalen Chat** kannst du sagen *„Bau mir eine Komponente für …“* – Claude und Codex dürfen in den
Komponenten-Ordner schreiben und wissen über den A2UI-Skill, wie es geht.

Hinweis: Beim Neuzeichnen gehen Eingaben in Screens verloren, die noch nicht per Button an das Modell gesendet wurden.

---

## Wo die Komponenten liegen

```
~/Library/Application Support/Claude2UI/components/
├── README.md                 ← Kurzanleitung (wird von der App gepflegt)
├── ANLEITUNG.md              ← diese Anleitung (wird von der App gepflegt, für Werkstatt-Chats)
├── ContactCard/
│   └── component.json        ← mitgeliefertes Beispiel
└── KpiTile/
    └── component.json        ← deine Komponente
```

- Jede Komponente ist **ein Unterordner mit einer `component.json`**. Der Ordnername ist frei wählbar; maßgeblich ist
  das Feld `name` in der Datei.
- Andere Dateien im Unterordner (Notizen, Beispiele) werden ignoriert.
- Beim ersten Start legt die App den Ordner mit dem Beispiel `ContactCard` an. Du darfst es ändern oder löschen.

---

## Aufbau einer `component.json`

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `name` | ja | Name der Komponente in **PascalCase** (`ContactCard`, `KpiTile`). Darf keine eingebaute Komponente sein. |
| `description` | ja | Wofür die Komponente gedacht ist. **Das Modell entscheidet anhand dieses Textes**, ob es sie verwendet. |
| `properties` | nein | Eigenschaften, die man beim Verwenden angibt (siehe unten). |
| `template` | ja | Liste von Komponenten (eingebaute oder eigene). Genau eine hat `"id": "root"`. |
| `example` | nein | Beispielwerte für die Eigenschaften. Erscheinen in der Doku für das Modell – sehr empfehlenswert. |

Verwendet wird die Komponente wie jede andere – mit `id`, `component` und ihren Eigenschaften:

```json
{"id": "umsatz", "component": "KpiTile", "title": "Umsatz", "value": "1,28 Mio. €"}
```

Zusätzlich erlaubt: `weight` (Flex-Anteil, wenn die Komponente direkt in einer `Row` oder `Column` steht).

---

## Eigenschaften und ihre Typen

Jede Eigenschaft hat einen `type` und optional `required`, `default`, `enum` und `description`.

| `type` | Erwartet | Typischer Einsatz |
|---|---|---|
| `DynamicString` | Text **oder** Bindung `{"@path": "/…"}` | Beschriftungen, Werte, Bild-URLs |
| `DynamicNumber` | Zahl **oder** Bindung | Slider-Werte, Fortschritt |
| `DynamicBoolean` | `true`/`false` **oder** Bindung | Checkbox-Werte |
| `DynamicValue` | beliebiger Wert **oder** Bindung | Datenlisten für Table/Charts |
| `string` | fester Text | Varianten, Farbtöne (oft mit `enum`) |
| `number` | feste Zahl | Höhen, Anzahl |
| `boolean` | fester Wahrheitswert | Schalter wie `donut` |
| `Action` | Aktion `{"event": {…}}` | Button-Klicks (siehe [Aktionen](#aktionen-buttons)) |
| `Child` | ID einer Komponente | Ein Slot für Inhalt von außen |
| `ChildList` | Liste von IDs oder Vorlage `{"path", "componentId"}` | Mehrere Slots / Listen |

Weitere Angaben:

- `required: true` – muss angegeben werden (außer es gibt einen `default`).
- `default` – Wert, wenn die Eigenschaft fehlt.
- `enum` – erlaubte Werte (nur für Texte), z. B. `["info", "success", "warning", "error"]`.
- `description` – wird dem Modell gezeigt. Kurz sagen, was hineingehört, gern mit Format-Hinweis.

Beim Verwenden prüft die App jede Instanz: fehlende Pflichtangaben, falscher Typ, Wert außerhalb von `enum` und
**unbekannte Eigenschaften** (Tippfehler) werden abgelehnt – das Modell bekommt die Meldung und korrigiert sich.

---

## Die Vorlage und Platzhalter

`template` ist eine flache Liste von Komponenten, genau wie in einer A2UI-Nachricht. Kinder werden per ID verwiesen.
Erlaubt sind **alle eingebauten Komponenten** (Basic Catalog, Charts, Table, Metric, Badge, Alert, …) und **andere
eigene Komponenten**.

Ein **Platzhalter** ist ein Text, der genau `"$eigenschaft"` lautet. Er wird durch den Wert der Instanz ersetzt –
egal ob das ein Text, eine Zahl, eine Bindung `{"@path": …}`, eine Liste oder eine Aktion ist:

```json
{ "id": "value", "component": "Text", "text": "$value" }
```

Wichtig:

- Ein Platzhalter muss **der ganze Wert** sein. `"Hallo $name"` funktioniert nicht.
  Für zusammengesetzte Texte gibt man den fertigen Text als Eigenschaft an – oder bindet im Screen per
  `formatString` (siehe [Daten binden](#daten-binden)).
- Platzhalter dürfen überall stehen, auch tief verschachtelt (z. B. in `series`, `columns` oder im `context` einer Aktion).
- Jeder Platzhalter muss in `properties` deklariert sein – sonst wird die Datei abgelehnt.

### Was mit den IDs passiert

Jede Instanz bekommt eigene IDs, damit eine Komponente mehrfach im selben Screen stehen kann:

- Die Komponente mit `"id": "root"` übernimmt die **ID der Instanz** (z. B. `ada`). So funktionieren Verweise von außen.
- Alle anderen IDs bekommen die Instanz als Präfix: `title` wird zu `ada__title`.

Du brauchst dich darum nicht zu kümmern – außer bei Fehlermeldungen, die solche IDs nennen.

---

## Optionale Eigenschaften lassen Teile weg

Fehlt eine optionale Eigenschaft (ohne `default`), **entfällt der Teil der Vorlage, der sie direkt anzeigt** – samt
Verweisen darauf. Beispiel: Ohne `note` fällt im `KpiTile` oben der dritte Text weg, statt leer oder fehlerhaft zu sein.

Genauer:

- Entfernt wird jede Vorlagen-Komponente, bei der ein **direktes Feld** genau `"$eigenschaft"` lautet und der Wert fehlt.
- Sie verschwindet auch aus den `children` ihrer Eltern.
- Hat ein Elternteil nur dieses eine Kind (`child`, `trigger`, `content`), entfällt es mit.
- Die Wurzel (`root`) entfällt nie. Nutze in der Wurzel deshalb keine optionalen Platzhalter.

Willst du stattdessen einen festen Ersatzwert, gib der Eigenschaft einen `default`.

---

## Slots: Inhalte von außen einsetzen

Mit `Child` bzw. `ChildList` nimmt eine Komponente **andere Komponenten des Screens** auf – wie ein Rahmen:

```json
{
  "name": "Section",
  "description": "Abschnitt mit Überschrift und beliebigem Inhalt darunter.",
  "properties": {
    "title": { "type": "DynamicString", "required": true },
    "content": { "type": "Child", "required": true, "description": "ID der Komponente, die im Abschnitt steht." }
  },
  "template": [
    { "id": "root", "component": "Column", "children": ["head", "body"] },
    { "id": "head", "component": "Text", "text": "$title" },
    { "id": "body", "component": "Card", "child": "$content" }
  ],
  "example": { "title": "Umsatz", "content": "umsatzChart" }
}
```

Verwendung im Screen (die Komponente `umsatzChart` wird ganz normal daneben definiert):

```json
{"id": "s1", "component": "Section", "title": "Umsatz", "content": "umsatzChart"},
{"id": "umsatzChart", "component": "LineChart", "data": {"@path": "/umsatz"}, "xKey": "monat", "series": [{"key": "wert"}]}
```

Slots sollten in der Regel `required` sein – fehlt der Inhalt, entfällt sonst der ganze Rahmenteil.

---

## Aktionen (Buttons)

Eine Eigenschaft vom Typ `Action` reicht eine Aktion an einen Button der Vorlage durch. So bestimmt der Verwender,
was beim Klick an das Modell geht:

```json
{
  "name": "ConfirmBox",
  "description": "Hinweis mit Frage und einem Bestätigen-Button.",
  "properties": {
    "text": { "type": "DynamicString", "required": true },
    "buttonText": { "type": "DynamicString", "default": "Bestätigen" },
    "onConfirm": { "type": "Action", "required": true, "description": "Aktion beim Klick auf den Button." }
  },
  "template": [
    { "id": "root", "component": "Column", "children": ["hint", "btn"] },
    { "id": "hint", "component": "Alert", "tone": "warning", "text": "$text" },
    { "id": "btnText", "component": "Text", "text": "$buttonText" },
    { "id": "btn", "component": "Button", "variant": "primary", "child": "btnText", "action": "$onConfirm" }
  ],
  "example": {
    "text": "Sollen 3 Einträge gelöscht werden?",
    "onConfirm": { "event": { "name": "loeschen_bestaetigt" } }
  }
}
```

Der Klick kommt beim Modell wie gewohnt als `A2UI-Aktion: {"name": "loeschen_bestaetigt", …}` an.

---

## Daten binden

Werte, die sich ändern oder vom Nutzer eingegeben werden, bindet man im Screen an das Datenmodell
(`{"@path": "/kunde/name"}`). Für eigene Komponenten gilt:

- **Bindungen als Eigenschaft durchreichen** – so kann jede Instanz an eine andere Stelle binden:
  `{"component": "KpiTile", "title": "Umsatz", "value": {"@path": "/kpi/umsatz"}}`.
- **Keine festen absoluten Pfade in der Vorlage**, z. B. `"text": {"@path": "/wert"}`: Alle Instanzen würden dieselbe
  Stelle des Datenmodells teilen. Das ist nur sinnvoll, wenn genau das gewollt ist.
- Funktionsaufrufe wie `{"@call": "formatCurrency", "args": {…}}` lassen sich ebenfalls als Wert einer
  `DynamicString`-Eigenschaft übergeben.

---

## Komponenten verschachteln

Vorlagen dürfen andere **eigene** Komponenten verwenden – z. B. ein `TeamPanel`, das mehrere `ContactCard`s enthält.
Die Auflösung geht bis zu fünf Ebenen tief; tiefere (oder zirkuläre) Verschachtelung wird als Fehler gemeldet.

---

## Wie Claude und Codex davon erfahren

- Der A2UI-Server der App bietet das Werkzeug **`describe_components`**. Es liefert eine Übersicht aller Komponenten und
  die vollständige Doku der eigenen – erzeugt aus `description`, den Eigenschaften (mit Typ, Pflicht, `enum`, `default`,
  `description`) und dem `example`.
- Der A2UI-Skill weist das Modell an, dieses Werkzeug vor dem ersten Screen einer Session aufzurufen und **passende eigene
  Komponenten bevorzugt** zu verwenden.
- Neue oder geänderte Komponenten sind beim nächsten Aufruf sichtbar. Hat das Modell in einer laufenden Session schon
  nachgeschaut, sag ihm einfach: „Schau dir die Komponenten nochmal an.“
- Bereits angezeigte Screens werden bei jeder Änderung an einer Komponente automatisch neu gezeichnet.

---

## Fehler finden

- **Einstellungen → Eigene A2UI-Komponenten** zeigt alle geladenen Komponenten und **rot alle fehlerhaften Dateien**
  mit Grund, z. B. `KpiTile/component.json: Platzhalter „$wert“ ist keine deklarierte Eigenschaft.`
- Typische Fehler in Dateien:
  - kein gültiges JSON (Komma zu viel, Anführungszeichen vergessen),
  - `name` nicht in PascalCase oder gleich einer eingebauten Komponente,
  - keine Vorlagen-Komponente mit `"id": "root"`, doppelte IDs,
  - Platzhalter ohne passende Eigenschaft, unbekannter `type`.
- Fehler beim **Verwenden** (fehlende Pflichtangabe, Tippfehler in Eigenschaften) sieht das Modell als Validierungsfehler
  und korrigiert sie selbst; im Chat erscheint dann kurz „Screen abgelehnt“.

---

## Tipps für gute Komponenten

- **Die `description` ist das Wichtigste.** Schreib sie so, dass klar ist, *wann* die Komponente passt
  („Visitenkarte einer Person: …“), nicht nur, was sie enthält.
- **Ein `example` angeben.** Modelle orientieren sich stark an Beispielen.
- **Eigenschaften knapp und sprechend benennen** (`title`, `value`, `status`), mit kurzer `description` und – wo
  sinnvoll – `enum` oder `default`.
- **Formatierung dem Modell überlassen**, wenn es einfacher ist (`"value": "1,28 Mio. €"`), oder eingebaute Widgets
  mit Formatierung nutzen (`Metric` mit `format: "currency"`).
- **Klein anfangen**: Eine Komponente pro Aufgabe; größere Bausteine aus kleineren zusammensetzen.

---

## Was (noch) nicht geht

- **Eigene Darstellung** (eigenes HTML/CSS/JavaScript, z. B. ein Kanban-Board) – geplant als „Web Components“
  (siehe `BACKLOG.md`). Bis dahin lässt sich alles bauen, was aus den vorhandenen Komponenten zusammensetzbar ist.
- **Platzhalter mitten im Text** (`"Hallo $name"`).
- **Bedingungen und Schleifen** in der Vorlage – außer über eingebaute Mittel: `List` mit
  `{"path": …, "componentId": …}` für Listen und optionale Eigenschaften zum Weglassen von Teilen.
- **Eigene Funktionen** (für `@call`) – nur die eingebauten (`formatString`, `formatCurrency`, `required`, …).

---

## Wie es technisch funktioniert

Für Neugierige und Mitentwickler:

- Die Definitionen werden in der App (`src/main/componentsLoader.ts`) und im A2UI-MCP-Server geladen und geprüft
  (`parseCompositeDef` in `src/shared/a2ui-composites.ts`).
- Bevor eine A2UI-Nachricht validiert oder angezeigt wird, löst `expandComposites` jede Instanz in die Komponenten ihrer
  Vorlage auf. Validator und Renderer sehen dadurch nur eingebaute Komponenten – eigene Komponenten brauchen keinen
  eigenen Code.
- Instanzen werden vorher mit `checkCompositeInstance` geprüft, damit Fehlermeldungen sich auf die Instanz beziehen.
- `describe_components` erzeugt die Doku mit `compositeDoc`.
- Die Beispiele dieser Anleitung werden in `src/mcp/composites.test.ts` automatisch gegen den Validator geprüft.
