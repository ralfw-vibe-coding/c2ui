# C2UI

(früher: Claude2UI)

Desktop-App (Electron), in der mehrere Chats mit der Claude CLI oder der Codex CLI parallel neben- und übereinander laufen.

## Stand: Inkrement 1

- Frei teilbares Panel-Grid (Split-Baum wie in VS Code): Zellen rechts/unten teilen, Trenner verschieben, Zellen entfernen (Geschwister füllen den Platz).
- Chats per Drag&Drop aus der Sidebar oder am Zellen-Header in Zellen ziehen: Mitte = hineinlegen/tauschen, Rand = Zelle teilen.
- Sidebar mit eigener Chatliste (Doppelklick = umbenennen). Klick öffnet den Chat in der markierten Zelle.
- Neuer Chat mit Claude oder Codex: Buttons oben in der Sidebar oder in einer leeren Zelle, danach Arbeitsverzeichnis wählen. Leere Zellen bieten außerdem frühere Chats an.
- Pro Chat ein Arbeitsverzeichnis und ein Berechtigungs- bzw. Sandbox-Modus; Standard, Modell und Binary-Pfad je Agent in den Einstellungen.
- Anhänge: Bilder per Einfügen (⌘V) und Dateien per Drag & Drop. Sie landen im Anhang-Ordner des Chats
  (`<userData>/attachments/<chat>`); Claude bekommt Bilder als Bild und darf den Ordner lesen, Codex bekommt Bilder per `--image`.
- Arbeitsschritte (Werkzeugaufrufe, Zwischentexte) je Antwort einklappbar.
- **Bezug auf Teile einer Antwort:** Text im Chat markieren → „Bezug nehmen“ → Anmerkung tippen.
  ↩ übernimmt Zitat + Anmerkung als Chip ins Eingabefeld (mehrere sammelbar, gesendet als `> Zitat` + Anmerkung).
  ⌘↩ bzw. „In neuem Chat fragen“ zweigt einen neuen Chat daneben ab, der den bisherigen Verlauf kennt
  (Claude: `--resume <quelle> --fork-session --session-id <neu>`; Codex: Verlauf als Kontext im ersten Turn).
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
- **Eigene Komponenten ohne Programmieren**: `component.json` im Komponenten-Ordner (Einstellungen → „Ordner öffnen“),
  Vorlage aus vorhandenen Komponenten mit eigenen Eigenschaften; Claude/Codex finden sie über `describe_components`.
  **Komponenten-Werkstatt**: „Mit Claude bearbeiten“ in den Einstellungen öffnet einen Chat im Komponenten-Ordner;
  Änderungen zeichnen bestehende Screens live neu. **Anleitung: [docs/eigene-komponenten.md](docs/eigene-komponenten.md)**
- **Screen-Übersicht**: Leiste mit Live-Miniaturen aller aktiven Screens eines Chats; Klick springt hin,
  sichtbare Screens sind markiert, einklappbar.
- **Codex**: Den Skill findet Codex über ein Schatten-Home (`<userData>/codex-home`, Symlinks auf das echte Home,
  nur `.agents/skills` ergänzt um den A2UI-Skill); `CODEX_HOME` bleibt `~/.codex`. Der MCP-Server kommt per
  `-c mcp_servers.a2ui.…` mit Freigabe für `render_ui`.
- Noch nicht: lokale Eingaben ohne Aktion überleben keinen Neustart (siehe `BACKLOG.md`).
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
node scripts/a2ui-codex-e2e.mjs   # A2UI mit Codex
```

### App bauen und installieren (macOS, Apple Silicon)

```bash
npm run package                 # dist/mac-arm64/C2UI.app + dist/C2UI-<version>-b<build>-arm64.zip
npm run package -- --install    # zusätzlich nach /Applications (nur wenn C2UI nicht läuft)
```

Das Packskript (`scripts/package.mjs`) schreibt Build-Angaben nach `Contents/Resources/build.json`
(Build = Anzahl der Commits, dazu Version, Commit, Chip) und signiert mit einer **festen Identität**
(`package.json` → `c2ui.signIdentity` oder `C2UI_SIGN_IDENTITY`). Ein selbst erstelltes Code-Signing-Zertifikat
genügt (Schlüsselbundverwaltung → Zertifikatsassistent → Zertifikat erstellen → Typ „Code-Signierung“).
Ad-hoc-Signatur geht nicht: Dann passt kein neuer Build zur installierten App.

### Selbst-Aktualisierung aus einem Ordner

Ohne Apple-Entwicklerprogramm, Notarisierung oder Server: Das ZIP aus `dist/` kommt in einen Ordner, meist einen
geteilten Dropbox-Ordner. Jede installierte App schaut beim Start, alle 30 Minuten und auf Knopfdruck hinein
(Einstellungen → **Aktualisierung**: Ordner wählen, Jetzt prüfen, Update-Ordner entfernen) und bietet einen neueren
Build an; am Einstellungen-Knopf erscheint dann ein Punkt.

- Geprüft wird nur `build.json` im ZIP (`unzip -p`, ohne Entpacken); angeboten wird der höchste Build über dem
  laufenden mit passendem Chip.
- Installieren: neben die App entpacken (`.C2UI Update/`, gleiches Volume), Build erneut prüfen, Signatur prüfen
  (`codesign --verify --deep --strict`, dann die designated requirement der installierten App), Quarantäne entfernen,
  Tausch-Skript abgekoppelt starten, App beenden. Das Skript wartet aufs Ende, tauscht per `mv` (bei Fehler kommt die
  alte App zurück), räumt auf und startet neu.
- Warum ohne Sperre: Gatekeeper prüft nur Dateien mit `com.apple.quarantine`; Dropbox, iCloud Drive, Syncthing, `curl`
  setzen das nicht. Ein Download per Browser schon – darum keine Release-Downloads über den Browser.
- Der Update-Ordner gilt je Mac (`<userData>/update.json`). Die App aus dem Repo (`npm run dev`) aktualisiert sich nie.
- Für Entwickler: bei sich `dist/` als Update-Ordner eintragen, dann reicht `npm run package`.
- Den ersten Build mit Updater bekommt jeder einmal von Hand (ZIP entpacken, nach Programme ziehen, Ordner wählen).
- Code: `src/main/updater.ts` (Logik, Werkzeuge als Objekt → Tests mit Attrappen, echtes Tausch-Skript im Test),
  `src/main/updaterSetup.ts` (echte Werkzeuge), E2E mit echtem Build: `node scripts/update-e2e.mjs`.

Skill und MCP-Server liegen in der App entpackt unter `Contents/Resources/app.asar.unpacked/`, weil Claude und Codex
als fremde Prozesse nicht in `app.asar` lesen können. Gepackte App und Entwicklungsmodus teilen sich das Datenverzeichnis.

Daten liegen unter `~/Library/Application Support/C2UI/` (`chats.json`, `layout.json`, `settings.json`, `transcripts/`).
Gibt es noch Daten aus der Zeit, als die App Claude2UI hieß, nutzt sie weiterhin `…/Claude2UI/` – Chats und
Sessions verweisen mit absoluten Pfaden dorthin.

## Aufbau

- `src/shared/` – Typen, Layout-Operationen auf dem Split-Baum, Transkript-Reducer (von Main und Renderer genutzt)
- `src/main/` – Fenster, IPC, Speicherung, Chat-Verwaltung, CLI-Adapter
- `src/preload/` – sichere IPC-Brücke (`window.api`)
- `src/renderer/` – React-UI (Grid, Zellen, Chat, Sidebar), Zustand mit zustand
