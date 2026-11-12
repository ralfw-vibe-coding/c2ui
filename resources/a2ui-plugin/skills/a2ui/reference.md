# A2UI v1.0 – Katalog von Claude2UI

catalogId: `https://claude2ui.local/catalogs/v1/catalog.json` – enthält alle Komponenten des offiziellen Basic Catalog
(unten) plus Charts und ein Image für lokale Dateien (am Ende). Diese catalogId bei createSurface verwenden.

Automatisch erzeugt aus dem offiziellen Katalog (scripts/gen-a2ui-reference.mjs). Typen:
- `DynamicString|Number|Boolean|StringList|Value`: Literal ODER `{"@path": "/json/pointer"}` ODER Funktionsaufruf `{"@call": "name", "args": {...}}`.
- `ComponentId`/`Child`: ID einer anderen Komponente (Kinder immer per ID, nie inline).
- `ChildList`: Array von IDs ODER Vorlage `{"path": "/liste", "componentId": "vorlage"}`; in der Vorlage sind Pfade ohne führenden `/` relativ zum Listenelement.
- `Action`: `{"event": {"name": "...", "context": {...}}}` (geht an dich zurück) ODER `{"functionCall": {"@call": "openUrl", "args": {"url": "..."}}}` (lokal).
- Alle Komponenten haben `id` und `component`; optional `weight` (Flex-Anteil in Row/Column) und `checks` (bei Eingaben).

## Komponenten des Basic Catalog

### Text
- `text` **Pflicht**: DynamicString – The text content to display.
- `variant`: 'caption' | 'body' (Standard: "body") – A hint for the base text style.

### Icon
- `name` **Pflicht**: 'accountCircle' | 'add' | 'arrowBack' | 'arrowForward' | 'attachFile' | 'calendarToday' | 'call' | 'camera' | 'check' | 'close' | 'delete' | 'download' | 'edit' | 'event' | 'error' | 'fastForward' | 'favorite' | 'favoriteOff' | 'folder' | 'help' | 'home' | 'info' | 'locationOn' | 'lock' | 'lockOpen' | 'mail' | 'menu' | 'moreVert' | 'moreHoriz' | 'notificationsOff' | 'notifications' | 'pause' | 'payment' | 'person' | 'phone' | 'photo' | 'play' | 'print' | 'refresh' | 'rewind' | 'search' | 'send' | 'settings' | 'share' | 'shoppingCart' | 'skipNext' | 'skipPrevious' | 'star' | 'starHalf' | 'starOff' | 'stop' | 'upload' | 'visibility' | 'visibilityOff' | 'volumeDown' | 'volumeMute' | 'volumeOff' | 'volumeUp' | 'warning' | { svgPath: DynamicString } | DataBinding – The name of the icon to display.

### Video
- `url` **Pflicht**: DynamicString – The URL of the video to display.
- `posterUrl`: DynamicString – The URL of the poster image to display before the video plays.

### AudioPlayer
- `url` **Pflicht**: DynamicString – The URL of the audio to be played.
- `description`: DynamicString – A description of the audio, such as a title or summary.

### Row
A layout component that arranges its children horizontally.
- `children` **Pflicht**: ChildList – Defines the children.
- `justify`: 'center' | 'end' | 'spaceAround' | 'spaceBetween' | 'spaceEvenly' | 'start' | 'stretch' (Standard: "start") – Defines the arrangement of children along the main axis (horizontally).
- `align`: 'start' | 'center' | 'end' | 'stretch' (Standard: "stretch") – Defines the alignment of children along the cross axis (vertically).

### Column
A layout component that arranges its children vertically.
- `children` **Pflicht**: ChildList – Defines the children.
- `justify`: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly' | 'stretch' (Standard: "start") – Defines the arrangement of children along the main axis (vertically).
- `align`: 'center' | 'end' | 'start' | 'stretch' (Standard: "stretch") – Defines the alignment of children along the cross axis (horizontally).

### List
- `children` **Pflicht**: ChildList – Defines the children.
- `direction`: 'vertical' | 'horizontal' (Standard: "vertical") – The direction in which the list items are laid out.
- `align`: 'start' | 'center' | 'end' | 'stretch' (Standard: "stretch") – Defines the alignment of children along the cross axis.

### Card
- `child` **Pflicht**: Child – The ID of the single child component to be rendered inside the card.

### Tabs
- `tabs` **Pflicht**: { title: DynamicString, child: Child }[] – An array of objects, where each object defines a tab with a title and a child component.

### Modal
- `trigger` **Pflicht**: Child – The ID of the component that opens the modal when interacted with (e.g., a button).
- `content` **Pflicht**: Child – The ID of the component to be displayed inside the modal.

### Divider
- `axis`: 'horizontal' | 'vertical' (Standard: "horizontal") – The orientation of the divider.

### Button (unterstützt `checks`)
- `child` **Pflicht**: Child – The ID of the child component.
- `variant`: 'default' | 'primary' | 'borderless' (Standard: "default") – A hint for the button style.
- `action` **Pflicht**: Action

### TextField (unterstützt `checks`)
- `label` **Pflicht**: DynamicString – The text label for the input field.
- `value`: DynamicString – The value of the text field.
- `placeholder`: DynamicString – The placeholder text for the input field.
- `variant`: 'longText' | 'number' | 'shortText' | 'obscured' (Standard: "shortText") – The type of input field to display.

### CheckBox (unterstützt `checks`)
- `label` **Pflicht**: DynamicString – The text to display next to the checkbox.
- `value` **Pflicht**: DynamicBoolean – The current state of the checkbox (true for checked, false for unchecked).

### ChoicePicker (unterstützt `checks`)
A component that allows selecting one or more options from a list.
- `label`: DynamicString – The label for the group of options.
- `variant`: 'multipleSelection' | 'mutuallyExclusive' (Standard: "mutuallyExclusive") – A hint for how the choice picker should be displayed and behave.
- `options` **Pflicht**: { label: DynamicString, value: string }[] – The list of available options to choose from.
- `value` **Pflicht**: DynamicStringList – The list of currently selected values.
- `displayStyle`: 'checkbox' | 'chips' (Standard: "checkbox") – The display style of the component.
- `filterable`: boolean (Standard: false) – If true, displays a search input to filter the options.

### Slider (unterstützt `checks`)
- `label`: DynamicString – The label for the slider.
- `min`: number (Standard: 0) – The minimum value of the slider.
- `max` **Pflicht**: number – The maximum value of the slider.
- `value` **Pflicht**: DynamicNumber – The current value of the slider.
- `steps`: integer – The number of discrete divisions in the slider range.

### DateTimeInput (unterstützt `checks`)
- `value` **Pflicht**: DynamicString – The selected date and/or time value in ISO 8601 format.
- `enableDate`: boolean (Standard: false) – If true, allows the user to select a date.
- `enableTime`: boolean (Standard: false) – If true, allows the user to select a time.
- `min`: any – The minimum allowed date/time in ISO 8601 format.
- `max`: any – The maximum allowed date/time in ISO 8601 format.
- `label`: DynamicString – The text label for the input field.

## Funktionen (`{"@call": "name", "args": {...}}`)
- `required(value)` → validationResult: Checks that the value is not null, undefined, or empty.
- `regex(value, pattern: string)` → validationResult: Checks that the value matches a regular expression string.
- `length(value, min?: integer, max?: integer)` → validationResult: Checks string length constraints.
- `numeric(value, min?: number, max?: number)` → validationResult: Checks numeric range constraints.
- `email(value)` → validationResult: Checks that the value is a valid email address.
- `formatString(value)` → string: Performs string interpolation of data model values and other functions in the catalog functions list and returns the resulting string.
- `formatNumber(value, decimals?, grouping?)` → string: Formats a number with the specified grouping and decimal precision.
- `formatCurrency(value, currency, decimals?, grouping?)` → string: Formats a number as a currency string.
- `formatDate(value, format)` → string: Formats a timestamp into a string using a pattern.
- `pluralize(value, zero?, one?, two?, few?, many?, other)` → string: Returns a localized string based on the Common Locale Data Repository (CLDR) plural category of the count (zero, one, two, few, many, other).
- `openUrl(url)` → void: Opens the specified URL in a browser or handler (requires user activation).
- `and(values: DynamicBoolean[])` → boolean: Performs a logical AND operation on a list of boolean values.
- `or(values: DynamicBoolean[])` → boolean: Performs a logical OR operation on a list of boolean values.
- `not(value)` → boolean: Performs a logical NOT operation on a boolean value.

## Hinweise aus dem Katalog

For layout, use the Row and Column components to organize other components.

## Catalog Guidelines

1. String Concatenation & Formatting: A2UI does not support binary operators like '+' or formatting symbols. To concatenate strings or dynamically inject data bindings into text, you must use the catalog function `formatString(value)` where the value string contains placeholders formatted as `${expression}`:
   formatString("Hello ${/user/name}")

2. Strict Hierarchy: You must strictly adhere to the requested component nesting and hierarchy. If the prompt specifies that a component is 'inside' or 'contained in' another component, you MUST place it as a child of that specific component, not as a sibling or in a different container.

3. Validation Checks: When components support validation checks, specify any custom error messages directly as the 'message' inside the check. Do NOT create separate text-display components to display validation errors.

## Examples

Example 1: Dynamic text form
```json
[
  {
    "version": "1.0",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://claude2ui.local/catalogs/v1/catalog.json",
      "components": [
        {
          "id": "root",
          "component": "Column",
          "children": ["repField", "valueField"]
        },
        {
          "id": "repField",
          "component": "TextField",
          "label": "Representative",
          "value": {"@path": "/form/rep"},
          "placeholder": "Enter name"
        },
        {
          "id": "valueField",
          "component": "TextField",
          "label": "Deal Value",
          "value": {"@path": "/form/value"},
          "placeholder": "0.00",
          "variant": "number",
          "checks": [
            {
              "condition": {
                "@call": "required",
                "args": {"value": {"@path": "/form/value"}}
              },
              "message": "Deal value is required."
            }
          ]
        }
      ],
      "dataModel": {
        "form": {
          "rep": "John Doe",
          "value": 1500.00
        }
      }
    }
  }
]
```

Example 2: Dynamic list with templates
```json
[
  {
    "version": "1.0",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://claude2ui.local/catalogs/v1/catalog.json",
      "components": [
        {
          "id": "root",
          "component": "Card",
          "child": "breedList"
        },
        {
          "id": "breedList",
          "component": "List",
          "children": {
            "path": "/breeds",
            "componentId": "breedTemplate"
          },
          "direction": "horizontal"
        },
        {
          "id": "breedTemplate",
          "component": "Image",
          "url": {"@path": "url"}
        }
      ],
      "dataModel": {
        "breeds": [
          {
            "url": "https://example.com/poodle.jpg"
          },
          {
            "url": "https://example.com/lab.jpg"
          }
        ]
      }
    }
  }
]
```

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
