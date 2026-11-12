# Claude2UI

Desktop-App (Electron), in der mehrere Chats mit der Claude CLI oder der Codex CLI parallel neben- und übereinander laufen.

## Stand: Inkrement 1

- Frei teilbares Panel-Grid (Split-Baum wie in VS Code): Zellen rechts/unten teilen, Trenner verschieben, Zellen entfernen (Geschwister füllen den Platz).
- Chats per Drag&Drop aus der Sidebar oder am Zellen-Header in Zellen ziehen: Mitte = hineinlegen/tauschen, Rand = Zelle teilen.
- Sidebar mit eigener Chatliste (Doppelklick = umbenennen). Klick öffnet den Chat in der markierten Zelle.
- Neuer Chat mit Claude oder Codex: Buttons oben in der Sidebar oder in einer leeren Zelle, danach Arbeitsverzeichnis wählen. Leere Zellen bieten außerdem frühere Chats an.
- Pro Chat ein Arbeitsverzeichnis und ein Berechtigungs- bzw. Sandbox-Modus; Standard, Modell und Binary-Pfad je Agent in den Einstellungen.
- Ein Chat ist höchstens in einer Zelle offen. Layout, Chatliste und Transkripte überstehen einen Neustart.
- Wird ein arbeitender Chat geschlossen, fragt die App nach: im Hintergrund weiterlaufen lassen, abbrechen oder nicht schließen.

## Anbindung der Claude CLI

Pro Chat läuft bei Bedarf ein Prozess
`claude -p --input-format stream-json --output-format stream-json --include-partial-messages …`
im Arbeitsverzeichnis des Chats. Er bedient mehrere Turns (spart ca. 3 s Kaltstart pro Turn) und wird nach
einstellbarem Leerlauf beendet. Der nächste Turn startet ihn mit `--resume <sessionId>` neu.

## Anbindung der Codex CLI

Pro Turn ein `codex exec --json`-Prozess im Arbeitsverzeichnis, ab dem zweiten Turn `codex exec resume <threadId>`.
Der Sandbox-Modus geht als `-c sandbox_mode=…` mit, Rückfragen sind aus (`approval_policy="never"`),
`--skip-git-repo-check` erlaubt Ordner ohne Git. Beide Adapter implementieren `src/main/agents/types.ts`.

## A2UI (Inkrement 2, erster Stand)

Claude kann auf Wunsch interaktive Oberflächen im Chat anzeigen (A2UI v1.0, Basic Catalog).
Ohne ausdrücklichen Wunsch antwortet Claude wie gewohnt mit Text.

- **Plugin** `resources/a2ui-plugin/` wird jedem Claude-Prozess per `--plugin-dir` mitgegeben: Skill `a2ui`
  (Anleitung + `reference.md`, erzeugt von `scripts/gen-a2ui-reference.mjs` aus dem offiziellen Katalog).
- **MCP-Server** `src/mcp/a2ui-server.ts` (Build: `out/main/a2ui-mcp.js`, läuft mit Electron als Node) stellt das
  Tool `render_ui` bereit und prüft jede Nachricht mit `@a2ui/web_core` gegen den Katalog. Fehler gehen an das
  Modell zurück, das dann korrigiert. Den bisherigen Stand eines Chats bekommt er über `A2UI_STATE_FILE`.
- **Rendering** mit `@a2ui/react`: Ein Screen erscheint dort, wo er angelegt wurde; Updates mit derselben
  `surfaceId` ändern ihn in-place (die App scrollt hin). Button-Aktionen gehen als Nachricht
  `A2UI-Aktion: {…}` an Claude; solange Claude arbeitet, sind Screens gesperrt.
- **Eigener Katalog** (`src/shared/a2ui-catalog.ts`): Basic Catalog + LineChart, BarChart, PieChart, ScatterChart,
  Table, Metric, Progress, Alert, Badge, CodeBlock und ein Image, das lokale Dateien über `c2ui-file://` lädt
  (nur Bilddateien). Neue Komponente = Schema dort + React-Implementierung (`src/renderer/src/a2ui/`) + Doku in
  `resources/a2ui-plugin/skills/a2ui/extra-components.md` (ein Test prüft, dass jede Eigenschaft beschrieben ist).
- **Screen-Übersicht**: Leiste mit Live-Miniaturen aller aktiven Screens eines Chats; Klick springt hin,
  sichtbare Screens sind markiert, einklappbar.
- Noch nicht: lokale Eingaben ohne Aktion überleben keinen Neustart; Codex hat noch kein A2UI.
- Testansicht der Komponenten: Fenster mit `#a2ui-test` laden (`location.hash`).

## Entwicklung

```bash
npm install
npm run dev        # App mit Hot Reload
npm test           # Unit-Tests (Layout, Transkript)
npm run typecheck
npm run smoke      # E2E gegen echte Claude CLI (Modell haiku, eigenes Datenverzeichnis)
node scripts/a2ui-e2e.mjs   # A2UI-E2E mit Claude Sonnet (nach npm run build)
node scripts/a2ui-charts-e2e.mjs; node scripts/a2ui-widgets-e2e.mjs   # Charts/Widgets mit Claude
node scripts/screens-strip-check.mjs   # Screen-Übersicht ohne Modellaufruf
```

Daten liegen unter `~/Library/Application Support/Claude2UI/` (`chats.json`, `layout.json`, `settings.json`, `transcripts/`).

## Aufbau

- `src/shared/` – Typen, Layout-Operationen auf dem Split-Baum, Transkript-Reducer (von Main und Renderer genutzt)
- `src/main/` – Fenster, IPC, Speicherung, Chat-Verwaltung, CLI-Adapter
- `src/preload/` – sichere IPC-Brücke (`window.api`)
- `src/renderer/` – React-UI (Grid, Zellen, Chat, Sidebar), Zustand mit zustand
