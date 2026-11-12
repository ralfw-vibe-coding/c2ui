# Backlog

## Als Nächstes (in dieser Reihenfolge)

1. **Codex über `codex app-server`** statt `codex exec`: Codex stellt Threads im Hintergrund auf ein
   „paginated“-Format um, das `codex exec resume` nicht fortsetzen kann („paginated_threads is not supported yet“).
   Derzeit fängt die App das ab und startet einen neuen Thread mit dem Verlauf aus ihrem Transkript (verliert
   Detailkontext wie Befehlsausgaben). Der app-server (JSON-RPC, von der Codex-App genutzt) könnte das sauber lösen
   und brächte auch Streaming, Bild-Events und Freigaben.
2. **Codex**: Antworten streamen (derzeit nur ganze Absätze), Kosten anzeigen – voraussichtlich mit Punkt 1.

## A2UI (gesammelt, noch nicht eingeplant)

- **Eigene Komponenten mit eigenem Code (Stufe 3):** echte neue Darstellung als Web Component (`element.js`),
  z. B. Kanban-Board – nur für vertrauenswürdige eigene Komponenten (läuft im App-Fenster) oder abgeschottet im iframe.
  Dazu: Freigabe vor dem Aktivieren von Komponenten mit eigenem Code.
- **Werkstatt vom Screen aus öffnen:** Knopf am Screen, der die Werkstatt für die darin verwendeten eigenen
  Komponenten öffnet.
- **Lokale Eingaben in A2UI-Screens speichern**, die ohne Button-Aktion gemacht wurden (überleben derzeit keinen Neustart).
- **Weitere Widgets** nach Bedarf (z. B. Timeline, Kalender, Karte, Kanban); Muster: Schema in
  `src/shared/a2ui-catalog.ts`, React in `src/renderer/src/a2ui/`, Doku in `extra-components.md`.

## Später

- **Freigaben im UI** statt nur fester Berechtigungsmodi (Claude `--permission-prompt-tool`).

## Erledigt

- Panel-Grid, Sidebar, Persistenz, Claude- und Codex-Adapter, Modell pro Chat
- A2UI v1.0 mit eigenem Katalog (Basic + Charts, Table, Metric, Progress, Alert, Badge, Link, CodeBlock, Image lokal)
- Screen-Übersicht mit Live-Miniaturen
- A2UI auch für Codex (Skill über Schatten-Home, MCP per `-c`)
- Eigene A2UI-Komponenten (Stufen 1+2): Komponenten-Ordner mit `component.json`, `describe_components`,
  Platzhalter auch mitten im Text, optionale Teile; Anleitung: docs/eigene-komponenten.md
- Komponenten-Werkstatt (Chat im Komponenten-Ordner, Live-Neuzeichnen) und Bauen auf Zuruf aus jedem Chat
- Links/E-Mail/Telefon öffnen (`openUrl` mit mailto:/tel:, Komponente `Link`)
- Einklappbare Arbeitsschritte zwischen Frage und Antwort
- Bilder und Dateien per Einfügen und Drag & Drop
- Bezug auf Teile einer Antwort: markieren → Overlay → Chips im Eingabefeld; „In neuem Chat fragen“ (Fork)
- Selbst-Aktualisierung aus einem Ordner (Dropbox o. Ä.), feste Signatur, `npm run package`
- Umbenennung in C2UI (Repo ralfw-vibe-coding/c2ui)
