import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import { LOCAL_FILE_SCHEME } from '@shared/a2ui'
import type { AgentKind, ChatPatch, LayoutState, PermissionMode, Settings } from '@shared/types'
import { ChatManager } from './chats'
import { ensureComponentsDir, loadComposites } from './componentsLoader'
import { watch } from 'node:fs'
import { listModels } from './models'
import { resolveLoginPath } from './env'
import { Storage } from './storage'

app.setName('Claude2UI')
// Für Tests: eigenes Datenverzeichnis per Umgebungsvariable.
if (process.env.CLAUDE2UI_USER_DATA) app.setPath('userData', process.env.CLAUDE2UI_USER_DATA)

const iconPath = join(app.getAppPath(), 'resources', 'icon.png')

/**
 * Pfad für externe Programme (Claude/Codex, MCP-Server): In der gepackten App liegen diese Dateien
 * entpackt neben dem asar-Archiv (asarUnpack), weil fremde Prozesse nicht in app.asar lesen können.
 */
const unpacked = (p: string): string => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

// Lokale Bilder für A2UI-Screens: c2ui-file://local/<absoluter Pfad>. Nur Bilddateien.
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

const COMPONENTS_README = `# Eigene A2UI-Komponenten für Claude2UI

Jeder Unterordner mit einer \`component.json\` ist eine eigene Komponente. Claude und Codex sehen sie über das
Werkzeug \`describe_components\` und können sie in Screens wie eingebaute Komponenten verwenden.
Änderungen wirken sofort (für neue Screens bzw. Aufrufe).

Aufbau (siehe ContactCard/component.json):
- name: Name in PascalCase, nicht wie eine eingebaute Komponente
- description: wofür die Komponente gedacht ist (liest das Modell)
- properties: Eigenschaften mit type (DynamicString, DynamicNumber, DynamicBoolean, DynamicValue, Action, Child,
  ChildList, string, number, boolean), optional required, enum, default, description
- template: Komponenten aus vorhandenen Bausteinen, eine davon mit "id": "root"; "$eigenschaft" als Platzhalter.
  Fehlt eine optionale Eigenschaft, entfällt der Vorlagenteil, der sie direkt anzeigt (samt Verweisen darauf).
- example: Beispielwerte für die Doku
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
    title: 'Claude2UI',
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

  // Links aus Chat-Antworten im Standardbrowser öffnen, nie im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
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
  ipcMain.handle('chats:update', (_e, id: string, patch: ChatPatch) => manager.update(id, patch))
  ipcMain.handle('chats:delete', (_e, id: string) => manager.delete(id))
  ipcMain.handle('transcript:get', (_e, id: string) => manager.transcript(id))
  ipcMain.handle('agent:send', (_e, id: string, text: string) => manager.send(id, text))
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
  ensureComponentsDir(componentsDir, unpacked(join(app.getAppPath(), 'resources', 'example-components')), COMPONENTS_README)
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
    }
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
