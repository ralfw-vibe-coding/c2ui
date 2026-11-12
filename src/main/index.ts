import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import { LOCAL_FILE_SCHEME } from '@shared/a2ui'
import type { AgentKind, Attachment, ChatPatch, LayoutState, PermissionMode, Settings } from '@shared/types'
import { ChatManager } from './chats'
import { ensureComponentsDir, loadComposites } from './componentsLoader'
import { existsSync, watch } from 'node:fs'
import { listModels } from './models'
import { resolveLoginPath } from './env'
import { Storage } from './storage'

app.setName('C2UI')
// Für Tests: eigenes Datenverzeichnis per Umgebungsvariable.
if (process.env.CLAUDE2UI_USER_DATA) app.setPath('userData', process.env.CLAUDE2UI_USER_DATA)
else {
  // Die App hieß früher Claude2UI. Vorhandene Daten bleiben dort: Chats, Werkstatt und Anhänge verweisen
  // mit absoluten Pfaden hinein (auch die Sessions von Claude/Codex), ein Umzug würde sie abhängen.
  const legacy = join(app.getPath('appData'), 'Claude2UI')
  if (existsSync(join(legacy, 'chats.json'))) app.setPath('userData', legacy)
}

const iconPath = join(app.getAppPath(), 'resources', 'icon.png')

/**
 * Pfad für externe Programme (Claude/Codex, MCP-Server): In der gepackten App liegen diese Dateien
 * entpackt neben dem asar-Archiv (asarUnpack), weil fremde Prozesse nicht in app.asar lesen können.
 */
const unpacked = (p: string): string => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

// Lokale Bilder für A2UI-Screens: c2ui-file://local/<absoluter Pfad>. Nur Bilddateien.
/** Was nach außen geöffnet werden darf (Browser, Mail-App, Telefon). */
const EXTERNAL_URL = /^(https?:|mailto:|tel:)/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i
protocol.registerSchemesAsPrivileged([
  { scheme: LOCAL_FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function registerLocalFileProtocol(): void {
  protocol.handle(LOCAL_FILE_SCHEME, async (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname)
    if (!IMAGE_EXT.test(path)) return new Response('Nur Bilddateien', { status: 403 })
    try {
      return await net.fetch(pathToFileURL(path).toString())
    } catch {
      return new Response('Nicht gefunden', { status: 404 })
    }
  })
}

let win: BrowserWindow | null = null
let manager: ChatManager
let loginPath = ''
let componentsDir = ''

const COMPONENTS_README = `# Eigene A2UI-Komponenten für C2UI

(Diese Datei und ANLEITUNG.md werden von C2UI bei jedem Start aktualisiert – eigene Notizen bitte woanders ablegen.)

Jeder Unterordner mit einer \`component.json\` ist eine eigene Komponente: eine Vorlage aus vorhandenen
A2UI-Komponenten mit eigenen Eigenschaften. Claude und Codex sehen sie über das Werkzeug \`describe_components\`
und verwenden sie wie eingebaute Komponenten. Änderungen wirken sofort; Fehler zeigt C2UI unter
Einstellungen → Eigene A2UI-Komponenten.

Vollständige Anleitung mit Beispielen:
https://github.com/ralfw-vibe-coding/c2ui/blob/main/docs/eigene-komponenten.md

Kurzfassung einer component.json (siehe auch ContactCard/component.json):

{
  "name": "KpiTile",                       // PascalCase, nicht wie eine eingebaute Komponente
  "description": "Kennzahl-Kachel …",      // wann die Komponente passt – liest das Modell
  "properties": {                          // Eigenschaften der Komponente
    "title": { "type": "DynamicString", "required": true },
    "note":  { "type": "DynamicString" }   // optional: fehlt sie, entfällt der Teil, der sie anzeigt
  },
  "template": [                            // Vorlage aus vorhandenen Komponenten, eine mit id "root"
    { "id": "root",  "component": "Card", "child": "col" },
    { "id": "col",   "component": "Column", "children": ["title", "note"] },
    { "id": "title", "component": "Text", "text": "$title" },   // "$eigenschaft" = Platzhalter (auch mitten im Text: "Hallo $title")
    { "id": "note",  "component": "Text", "variant": "caption", "text": "$note" }
  ],
  "example": { "title": "Umsatz Q3", "note": "+12 %" }          // Beispiel für das Modell
}

Typen: DynamicString, DynamicNumber, DynamicBoolean, DynamicValue (Text/Zahl/… oder Bindung {"@path": …}),
string, number, boolean (feste Werte, mit "enum" einschränkbar), Action (für Buttons), Child/ChildList (Slots).
Buttons können per {"functionCall": {"@call": "openUrl", "args": {"url": "mailto:$email"}}} Links, Mail (mailto:)
und Telefon (tel:) öffnen. Fehlt ein eingebetteter Wert, entfällt die ganze Komponente.
(Kommentare mit // sind nur zur Erklärung – in echten JSON-Dateien nicht erlaubt.)
`
let quitting = false

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 450,
    title: 'C2UI',
    backgroundColor: '#1b1b1f',
    icon: iconPath,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Links aus Chat-Antworten im Standardbrowser bzw. in Mail/Telefon öffnen, nie im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_URL.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (EXTERNAL_URL.test(url)) void shell.openExternal(url)
    }
  })

  win.on('close', (e) => {
    if (quitting) return
    const busy = manager.busyIds()
    if (busy.length > 0) {
      const choice = dialog.showMessageBoxSync(win!, {
        type: 'warning',
        buttons: ['Beenden', 'Abbrechen'],
        defaultId: 1,
        cancelId: 1,
        message: `${busy.length} Chat(s) arbeiten noch.`,
        detail: 'Beim Beenden werden laufende Antworten abgebrochen.'
      })
      if (choice === 1) {
        e.preventDefault()
        return
      }
    }
    quitting = true
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('state:init', () => ({
    settings: manager.getSettings(),
    chats: manager.list(),
    layout: manager.getLayout(),
    busy: manager.busyIds(),
    home: app.getPath('home')
  }))
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => manager.setSettings(patch))
  ipcMain.handle('layout:set', (_e, l: LayoutState) => manager.setLayout(l))
  ipcMain.handle('chats:create', (_e, cwd: string, agent: AgentKind, mode?: PermissionMode) =>
    manager.create(cwd, agent, mode)
  )
  ipcMain.handle('chats:fork', (_e, sourceId: string, title: string) => manager.fork(sourceId, title))
  ipcMain.handle('chats:createWorkshop', (_e, component?: string) =>
    manager.create(componentsDir, 'claude', undefined, {
      title: component ? `Werkstatt: ${component}` : 'Komponenten-Werkstatt',
      purpose: 'component-workshop'
    })
  )
  ipcMain.handle('chats:update', (_e, id: string, patch: ChatPatch) => manager.update(id, patch))
  ipcMain.handle('chats:delete', (_e, id: string) => manager.delete(id))
  ipcMain.handle('transcript:get', (_e, id: string) => manager.transcript(id))
  ipcMain.handle('agent:send', (_e, id: string, text: string, attachments?: Attachment[]) =>
    manager.send(id, text, attachments ?? [])
  )
  ipcMain.handle('attachments:save', (_e, chatId: string, name: string, data: Uint8Array) =>
    manager.saveAttachment(chatId, name, data)
  )
  ipcMain.handle('attachments:import', (_e, chatId: string, path: string) => manager.importAttachment(chatId, path))
  ipcMain.handle('agent:interrupt', (_e, id: string) => manager.interrupt(id))
  ipcMain.handle('dialog:pickDirectory', async (_e, defaultPath?: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Arbeitsverzeichnis für den Chat wählen',
      defaultPath: defaultPath || app.getPath('home'),
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('components:list', () => ({ ...loadComposites(componentsDir), dir: componentsDir }))
  ipcMain.handle('models:list', (_e, agent: AgentKind) =>
    listModels(agent, manager.getSettings().agents[agent].path, loginPath)
  )
  ipcMain.handle('shell:reveal', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url !== 'string' || !EXTERNAL_URL.test(url.trim())) return false
    await shell.openExternal(url.trim())
    return true
  })
  ipcMain.handle('dialog:confirmBusy', async (_e, title: string, action: string) => {
    const r = await dialog.showMessageBox(win!, {
      type: 'question',
      buttons: ['Im Hintergrund weiterlaufen lassen', 'Antwort abbrechen', 'Nicht ' + action],
      defaultId: 0,
      cancelId: 2,
      message: `„${title}“ arbeitet noch.`,
      detail: 'Der Chat kann im Hintergrund fertig werden; beim nächsten Öffnen ist die Antwort da.'
    })
    return (['background', 'stop', 'cancel'] as const)[r.response]
  })
  ipcMain.handle('dialog:confirm', async (_e, message: string, detail: string, ok: string) => {
    const r = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: [ok, 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      message,
      detail
    })
    return r.response === 0
  })
}

app.whenReady().then(() => {
  // Im Entwicklungsmodus zeigt das Dock sonst das Electron-Icon (gepackt kommt es aus icon.icns).
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  const storage = new Storage(app.getPath('userData'))
  loginPath = resolveLoginPath()
  componentsDir = join(app.getPath('userData'), 'components')
  ensureComponentsDir(
    componentsDir,
    unpacked(join(app.getAppPath(), 'resources', 'example-components')),
    COMPONENTS_README,
    join(app.getAppPath(), 'docs', 'eigene-komponenten.md')
  )
  // Eigene Komponenten beobachten und den Renderer informieren.
  let watchTimer: NodeJS.Timeout | null = null
  try {
    watch(componentsDir, { recursive: true }, () => {
      if (watchTimer) clearTimeout(watchTimer)
      watchTimer = setTimeout(() => send('components:changed', loadComposites(componentsDir)), 300)
    })
  } catch {
    /* ohne Beobachtung: Änderungen wirken nach Neustart */
  }
  manager = new ChatManager(
    storage,
    loginPath,
    {
      agentEvent: (id, e) => send('agent:event', id, e),
      busy: (id, b) => send('agent:busy', id, b),
      chatsChanged: (chats) => send('chats:changed', chats)
    },
    {
      pluginDir: unpacked(join(app.getAppPath(), 'resources', 'a2ui-plugin')),
      serverScript: unpacked(join(__dirname, 'a2ui-mcp.js')),
      execPath: process.execPath,
      stateDir: join(app.getPath('userData'), 'a2ui-state'),
      shadowHomeDir: join(app.getPath('userData'), 'codex-home'),
      componentsDir
    },
    join(app.getPath('userData'), 'attachments')
  )
  registerIpc()
  registerLocalFileProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      quitting = false
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  manager?.disposeAll()
})
