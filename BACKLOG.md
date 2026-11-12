# Backlog

## Ideen / als Nächstes

- **Nachfrage zu markiertem Text**: Text in einer Antwort markieren und dazu eine Frage stellen. Beantwortet wird
  wahlweise im aktuellen Chat (Frage mit Zitat) oder in einem **neuen Chat**, der den Kontext des bisherigen mitbringt.
  - Claude: neuer Chat per `--resume <sessionId> --fork-session` (headless möglich, ganzer Kontext).
  - Codex: `codex fork` gibt es nur interaktiv; für `exec` vermutlich neue Session mit zitiertem Kontext
    oder Kopie der Session – prüfen.
  - UI-Idee: kleines Popover an der Markierung („Nachfragen hier“ / „…in neuem Chat“), neuer Chat öffnet
    sich in einer neuen Zelle neben dem aktuellen.
- **Lokale Eingaben in A2UI-Screens speichern**, die ohne Button-Aktion gemacht wurden (überleben derzeit keinen Neustart).
- **Weitere Widgets** nach Bedarf (z. B. Timeline, Kalender, Karte, Kanban); Muster: Schema in
  `src/shared/a2ui-catalog.ts`, React in `src/renderer/src/a2ui/`, Doku in `extra-components.md`.
- **Codex**: Antworten streamen (derzeit nur ganze Absätze), Kosten anzeigen.
- **Paketierung** als echte macOS-App (electron-builder, `resources/icon.icns`).
- **Freigaben im UI** statt nur fester Berechtigungsmodi (Claude `--permission-prompt-tool`).

## Erledigt

- Panel-Grid, Sidebar, Persistenz, Claude- und Codex-Adapter, Modell pro Chat
- A2UI v1.0 mit eigenem Katalog (Basic + Charts, Table, Metric, Progress, Alert, Badge, CodeBlock, Image lokal)
- Screen-Übersicht mit Live-Miniaturen
- A2UI auch für Codex (Skill über Schatten-Home, MCP per `-c`)
