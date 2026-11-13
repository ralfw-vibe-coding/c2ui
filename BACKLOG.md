# Backlog

## Als Nächstes (in dieser Reihenfolge)

(leer – nächste Schritte aus „Ideen“ oder „Konzept Diskurs“ wählen)

## Ideen (gesammelt, Reihenfolge offen)

- **Benachrichtigungen,** wenn ein Chat im Hintergrund fertig ist oder hängt.
- **Kontextfüllstand** je Chat (aus den Token-Angaben der CLIs; Codex liefert `thread/tokenUsage/updated` mit
  `modelContextWindow`); Verdichten machen die CLIs selbst.
- **Screens anheften:** A2UI-Screen in eine eigene Zelle lösen, der Chat aktualisiert ihn weiter.
- **Suche über alle Chats** (merken).

## Konzept „Diskurs“ (ausprobieren, erfühlen)

Ein **Chat** ist ein Ast, ein lineares Gespräch. Verzweigt er sich (Nebenchats mit geerbtem Kontext) und fließen
Ergebnisse wieder zurück, entsteht ein **Diskurs**. Vorbild Git: Diskurs = Repository, Chat = Branch, Turn = Commit,
Nebenchat = Branch mit Abzweigpunkt, Zurückführen = Merge. Nutzen weit über Software hinaus (Hausarbeit, Präsentation,
Konzept): man kann dem Diskurs folgen; als Export ein Entstehungsprotokoll (z. B. für die Dokumentation von KI-Einsatz).

Schritte, jeweils erst ausprobieren, bevor der nächste kommt:

1. ✓ **Baum in der Seitenleiste:** jeder Knoten ein Chat, voll aufklappbar wie ein Verzeichnisbaum (Navigation).
   **Abzweigpunkt** wird gespeichert: `forkFrom.at` = Turn-Anzahl, Transkript-Eintrag (`itemId`) und Zitat.
2. **Abzweigungen im Verlauf:** Markierung an der Stelle („↳ 2 Nachfragen“), Klick öffnet den Nebenchat;
   im Nebenchat Brotkrumen zurück zur Stelle.
3. **Diskursboard** (Nachvollziehen), zunächst nur ansehen: Zeit läuft nach unten, jeder Chat eine Spur
   (wie `git log --graph`), Turns als Knoten, Abzweige und Merges als Kanten, verworfene Äste ausgegraut.
   Klick auf einen Knoten öffnet den Chat im Grid an dieser Stelle.
4. **Semantischer Zoom:** weit = Abschnitte (Turns zwischen zwei Abzweig-/Merge-Punkten) als Kasten mit
   Zusammenfassung; mittel = Turns mit Kurztitel; nah = Frage/Antwort, Screens als Miniaturen.
   Kurztitel und Zusammenfassungen im Hintergrund durch ein kleines Modell (einfache Variante: erste Zeile der Frage).
5. **Vom Board aus abzweigen**, auch an früheren Stellen (Codex: `thread/fork` mit `lastTurnId`; Claude: prüfen).
6. **Merge:** Ergebnis eines Asts zurück in einen anderen – Squash (Zusammenfassung des Diffs seit dem Abzweig,
   Normalfall), voll (Turns wörtlich), Cherry-Pick (einzelne Stelle als Bezug-Chip, auch chatübergreifend),
   Gegenrichtung (Ast holt sich den Fortschritt des Ursprungs). Der empfangende Chat löst Widersprüche selbst;
   die Rückmeldung nennt den Abzweigpunkt.

Offene Punkte: Der Arbeitsordner verzweigt sich nicht mit – für Programmierarbeit evtl. eigener Git-Worktree je Ast.
Später denkbar: das Modell legt selbst Äste an (MCP-Werkzeug), sichtbare und ansprechbare „Subagenten“.

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

- **Zweitmeinung:** Zwillingschats Claude + Codex; Prompts gehen an beide, bis einer geschlossen wird.
  Achtung: im selben Ordner würden beide dieselben Dateien ändern.
- **Council of Experts:** mehrere Agenten/Rollen diskutieren ein Thema aus verschiedenen Perspektiven.
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
- Warteschlange: Nachrichten einreihen, während der Agent arbeitet
- Zwischenruf (Steer) aus der Warteschlange in die laufende Antwort (Claude)
- Codex über `codex app-server`: Streaming, Zwischenrufe, echtes Abzweigen, Fortsetzen auch „paginated“ Threads
  (neueste CLI wird automatisch gewählt, z. B. aus ChatGPT.app); Kosten liefert Codex nicht (Abo)
- Diskurs Schritt 1: Chat-Baum in der Seitenleiste (auf-/zuklappbar), Abzweigpunkt gespeichert
