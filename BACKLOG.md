# Backlog

## Ideen / als Nächstes

- **Auf Teile einer Antwort Bezug nehmen** (ein Feature, verbindet die beiden Ideen unten).
  Ziel: In einer langen Antwort z. B. die Frage aus Absatz 3 beantworten und zu Absatz 5 nachfragen –
  gezielt, ohne alles abzutippen.
  - **Markieren + Overlay (bevorzugt):** Absatz/Sätze markieren → kleines Overlay mit Eingabefeld → Anmerkung tippen.
    Das Ergebnis wird **unten in den Composer eingetragen** (Zitat + Anmerkung, gern als Chips gesammelt),
    gesendet wird erst, wenn ich im Haupt-Chat abschicke. Mehrere Bezüge lassen sich so zu einer Nachricht sammeln.
    Beim Senden etwa: `> Zitat aus der Antwort` + meine Anmerkung, je Bezug ein Block.
  - **Optional Absatznummern:** dezente Nummern beim Überfahren (¶3); Klick fügt „zu ¶3: “ samt Zitat in den
    Composer ein. Reine Nummern ohne Zitat reichen nicht – das Modell sieht die Nummerierung der App nicht.
  - **Nachfrage in neuem Chat:** im selben Overlay alternativ „in neuem Chat fragen“ – der neue Chat bringt den
    Kontext des bisherigen mit und öffnet sich in einer Zelle neben dem aktuellen.
    - Claude: `--resume <sessionId> --fork-session` (headless möglich, ganzer Kontext).
    - Codex: `codex fork` gibt es nur interaktiv; für `exec` vermutlich neue Session mit zitiertem Kontext
      oder Kopie der Session – prüfen.
- **Lokale Eingaben in A2UI-Screens speichern**, die ohne Button-Aktion gemacht wurden (überleben derzeit keinen Neustart).
- **Weitere Widgets** nach Bedarf (z. B. Timeline, Kalender, Karte, Kanban); Muster: Schema in
  `src/shared/a2ui-catalog.ts`, React in `src/renderer/src/a2ui/`, Doku in `extra-components.md`.
- **Codex über `codex app-server`** statt `codex exec`: Codex stellt Threads im Hintergrund auf ein
  „paginated“-Format um, das `codex exec resume` nicht fortsetzen kann („paginated_threads is not supported yet“).
  Derzeit fängt die App das ab und startet einen neuen Thread mit dem Verlauf aus ihrem Transkript (verliert
  Detailkontext wie Befehlsausgaben). Der app-server (JSON-RPC, von der Codex-App genutzt) könnte das sauber lösen
  und brächte auch Streaming, Bild-Events und Freigaben.
- **Codex**: Antworten streamen (derzeit nur ganze Absätze), Kosten anzeigen.
- **Paketierung**: DMG/Zip und Notarisierung für die Weitergabe (lokal läuft `npm run dist` bereits).
- **Freigaben im UI** statt nur fester Berechtigungsmodi (Claude `--permission-prompt-tool`).

## Erledigt

- Panel-Grid, Sidebar, Persistenz, Claude- und Codex-Adapter, Modell pro Chat
- A2UI v1.0 mit eigenem Katalog (Basic + Charts, Table, Metric, Progress, Alert, Badge, CodeBlock, Image lokal)
- Screen-Übersicht mit Live-Miniaturen
- A2UI auch für Codex (Skill über Schatten-Home, MCP per `-c`)
