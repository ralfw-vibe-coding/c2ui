# C2UI

(früher: Claude2UI)

Desktop-App (Electron), in der mehrere Chats mit der Claude CLI oder der Codex CLI parallel neben- und übereinander laufen.

## Stand: Inkrement 1

- Frei teilbares Panel-Grid (Split-Baum wie in VS Code): Zellen rechts/unten teilen, Trenner verschieben, Zellen entfernen (Geschwister füllen den Platz).
- Chats per Drag&Drop aus der Sidebar oder am Zellen-Header in Zellen ziehen: Mitte = hineinlegen/tauschen, Rand = Zelle teilen.
  Boards lassen sich genauso am Kopf verschieben. ⌘-Klick auf einen Chat in der Seitenleiste öffnet ihn in einer neuen
  Zelle rechts der markierten.
- Sidebar mit eigener Chatliste (Doppelklick = umbenennen). Klick öffnet den Chat in der markierten Zelle.
- Neuer Chat mit Claude oder Codex: Buttons oben in der Sidebar oder in einer leeren Zelle, danach Arbeitsverzeichnis wählen. Leere Zellen bieten außerdem frühere Chats an.
- Pro Chat ein Arbeitsverzeichnis und ein Berechtigungs- bzw. Sandbox-Modus; Standard, Modell und Binary-Pfad je Agent in den Einstellungen.
- Anhänge: Bilder per Einfügen (⌘V) und Dateien per Drag & Drop. Sie landen im Anhang-Ordner des Chats
  (`<userData>/attachments/<chat>`); Claude bekommt Bilder als Bild und darf den Ordner lesen, Codex bekommt Bilder als `localImage`.
- Arbeitsschritte (Werkzeugaufrufe, Zwischentexte) je Antwort einklappbar.
- **Bezug auf Teile einer Antwort:** Text im Chat markieren → „Bezug nehmen“ → Anmerkung tippen.
  ↩ übernimmt Zitat + Anmerkung als Chip ins Eingabefeld (mehrere sammelbar, gesendet als `> Zitat` + Anmerkung).
  ⌘↩ bzw. „In neuem Chat fragen“ zweigt einen neuen Chat daneben ab, der den bisherigen Verlauf kennt
  (Claude: `--resume <quelle> --fork-session --session-id <neu>`; Codex: `thread/fork`).
- **Warteschlange:** Während ein Chat arbeitet, bleibt das Eingabefeld frei; Enter reiht die Nachricht ein
  (mit Bezügen und Anhängen). Eingereihtes geht nach jeder Antwort einzeln raus, lässt sich bis dahin zurück ins
  Eingabefeld holen oder entfernen. Nach Abbruch oder Fehler hält die Schlange an („Fortsetzen“).
  Eine eingereihte Nachricht kann per „Zwischenruf“ (Steer) sofort in die laufende Antwort gehen; der Agent
  nimmt sie beim nächsten Schritt auf und erst dann erscheint sie im Verlauf (Claude: `--replay-user-messages`,
  Codex: `turn/steer`). Kommt sie zu spät, beantwortet der Agent sie direkt danach.
- **Chat-Baum:** Nebenchats stehen in der Seitenleiste eingerückt unter ihrem Ursprung (auf-/zuklappbar, Zustand
  pro Rechner). Ein Diskurs rückt nach oben, sobald in einem seiner Äste gearbeitet wird. Der Abzweigpunkt
  (Turn, Transkript-Eintrag, Zitat) wird mitgespeichert; der Tooltip nennt ihn.
- **Abzweigungen im Verlauf:** Im Ursprung steht „↳ Nachfrage“ mit den Nebenchats direkt hinter dem Absatz bzw.
  Listenpunkt, aus dem zitiert wurde (sonst am Ende der Antwort); Klick öffnet den Nebenchat rechts daneben.
  Im Nebenchat führen Brotkrumen (ganze Kette bis zur Wurzel) zurück: Klick öffnet den Ursprung links daneben,
  springt an die Stelle und markiert das Zitat einige Sekunden gelb.
- **Diskursboard:** In der Seitenleiste an jedem Chat eines Baums (Symbol „Verzweigung“): öffnet eine Zelle mit dem
  ganzen Baum als Graph wie `git log --graph` – Zeit nach unten, jeder Chat eine farbige Spur, jede Nutzernachricht
  ein Knoten (⚡ Zwischenruf, ■ A2UI-Aktion), Abzweigungen als Kurven. Klick auf eine Zeile öffnet den Chat in der
  Zelle daneben (bzw. der zuletzt vom Board geöffneten) und springt zur Nachricht; ⌘-Klick öffnet in einer neuen Zelle
  rechts davon; oder die Zeile auf eine beliebige Zelle ziehen (Mitte/Rand wie oben). Klick auf den Knoten einer
  Abzweigstelle (−/+) klappt die dort abgehenden Äste ein/aus. Aktualisiert sich live; übersteht einen Neustart.
- Seitenleiste: Breite am rechten Rand ziehen (Doppelklick = Standard), pro Rechner gemerkt.
- Ein Chat ist höchstens in einer Zelle offen. Layout, Chatliste und Transkripte überstehen einen Neustart.
- Wird ein arbeitender Chat geschlossen, fragt die App nach: im Hintergrund weiterlaufen lassen, abbrechen oder nicht schließen.

## Anbindung der Claude CLI

Pro Chat läuft bei Bedarf ein Prozess
`claude -p --input-format stream-json --output-format stream-json --include-partial-messages …`
im Arbeitsverzeichnis des Chats. Er bedient mehrere Turns (spart ca. 3 s Kaltstart pro Turn) und wird nach
einstellbarem Leerlauf beendet. Der nächste Turn startet ihn mit `--resume <sessionId>` neu.

## Anbindung der Codex CLI

Pro Chat läuft bei Bedarf `codex app-server` (JSON-RPC über stdin/stdout, wie in der Codex-App) als Kindprozess
von C2UI; er bedient mehrere Turns und wird nach Leerlauf beendet. Kein Daemon: läuft C2UI nicht, läuft auch
kein Server. Threads liegen wie immer unter `~/.codex` und werden per `thread/resume` fortgesetzt,
Nebenchats per `thread/fork`. Antworten kommen gestreamt (`item/agentMessage/delta`), Abbrechen per
`turn/interrupt`, Zwischenrufe per `turn/steer`. Sandbox-Modus pro Thread, Rückfragen aus (`approvalPolicy: never`).

**Welche Codex-CLI?** Ohne Pfad in den Einstellungen nimmt C2UI die neueste vorhandene: aus dem PATH oder die
in ChatGPT.app mitgelieferte (`Contents/Resources/codex-cli/bin/codex`). Die Codex-App stellt Threads auf ein
„paginated“-Format um, das ältere CLIs (z. B. 0.144) weder fortsetzen noch lesen können; die mitgelieferte
kann es. Scheitert das Fortsetzen trotzdem, geht der Chat in einem neuen Thread mit dem Verlauf als Kontext weiter.
Beide Adapter implementieren `src/main/agents/types.ts`.

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
  `-c mcp_servers.a2ui.…` (beim Start des app-servers) mit Freigabe für `render_ui`.
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
node scripts/queue-e2e.mjs codex; node scripts/steer-e2e.mjs codex   # Warteschlange, Zwischenruf
node scripts/codex-resume-e2e.mjs   # Codex-Chat über Neustart fortsetzen
node scripts/chat-tree-check.mjs   # Chat-Baum (ohne Modellaufruf)
node scripts/fork-nav-check.mjs    # Markierungen, Brotkrumen, Seitenleistenbreite (ohne Modellaufruf)
node scripts/board-check.mjs       # Diskursboard (ohne Modellaufruf)
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
