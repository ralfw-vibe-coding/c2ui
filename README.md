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

## Entwicklung

```bash
npm install
npm run dev        # App mit Hot Reload
npm test           # Unit-Tests (Layout, Transkript)
npm run typecheck
npm run smoke      # E2E gegen echte Claude CLI (Modell haiku, eigenes Datenverzeichnis)
```

Daten liegen unter `~/Library/Application Support/Claude2UI/` (`chats.json`, `layout.json`, `settings.json`, `transcripts/`).

## Aufbau

- `src/shared/` – Typen, Layout-Operationen auf dem Split-Baum, Transkript-Reducer (von Main und Renderer genutzt)
- `src/main/` – Fenster, IPC, Speicherung, Chat-Verwaltung, CLI-Adapter
- `src/preload/` – sichere IPC-Brücke (`window.api`)
- `src/renderer/` – React-UI (Grid, Zellen, Chat, Sidebar), Zustand mit zustand
